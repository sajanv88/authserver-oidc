import "server-only";
import { type Histogram, metrics } from "@opentelemetry/api";
import type { WebVitalName } from "./web-vital";

/** The instrumentation scope of this app's own spans and metrics. */
export const TELEMETRY_SCOPE = "auth-server";

// Bucket edges around each vital's "good" and "poor" thresholds (web.dev), so a dashboard can
// read the share of good page views straight from the buckets.
const VITAL_HISTOGRAMS: Record<
  WebVitalName,
  { description: string; unit: string; buckets: number[] }
> = {
  LCP: {
    description: "Largest Contentful Paint: when the page's main content was drawn",
    unit: "ms",
    buckets: [500, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10_000],
  },
  INP: {
    description: "Interaction to Next Paint: the slowest response to a click, tap or key",
    unit: "ms",
    buckets: [50, 100, 150, 200, 300, 500, 750, 1000, 2000],
  },
  CLS: {
    description: "Cumulative Layout Shift: how much the page moved while it loaded",
    unit: "1",
    buckets: [0.01, 0.05, 0.1, 0.15, 0.25, 0.5, 1],
  },
  FCP: {
    description: "First Contentful Paint: when the first text or image was drawn",
    unit: "ms",
    buckets: [500, 1000, 1500, 1800, 2500, 3000, 4000, 6000],
  },
  TTFB: {
    description: "Time to First Byte: from navigation to the response's first byte",
    unit: "ms",
    buckets: [100, 200, 400, 800, 1200, 1800, 3000, 5000],
  },
};

type Instruments = {
  flowDuration: Histogram;
  vitals: Record<WebVitalName, Histogram>;
};

let instruments: Instruments | undefined;

/**
 * Created on first use, not at import: the metrics API has no proxy provider, so an instrument
 * made before instrumentation.ts registers the SDK would stay a no-op for good.
 */
export function telemetryInstruments(): Instruments {
  if (instruments) return instruments;
  const meter = metrics.getMeter(TELEMETRY_SCOPE);
  const vital = (name: WebVitalName) => {
    const { description, unit, buckets } = VITAL_HISTOGRAMS[name];
    return meter.createHistogram(`browser.web_vital.${name.toLowerCase()}`, {
      description,
      unit,
      advice: { explicitBucketBoundaries: buckets },
    });
  };
  instruments = {
    flowDuration: meter.createHistogram("auth.flow.duration", {
      description: "How long each sign-in, sign-up, reset or admin step took, by outcome",
      unit: "s",
      advice: { explicitBucketBoundaries: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10] },
    }),
    vitals: {
      LCP: vital("LCP"),
      INP: vital("INP"),
      CLS: vital("CLS"),
      FCP: vital("FCP"),
      TTFB: vital("TTFB"),
    },
  };
  return instruments;
}

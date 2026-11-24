import { metrics, trace } from "@opentelemetry/api";
import { type HistogramMetricData, MeterProvider, MetricReader } from "@opentelemetry/sdk-metrics";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";

// Tests only: in-memory OpenTelemetry providers, installed globally like instrumentation.ts's
// (vitest gives each test file its own globals), to read back what the code recorded.

class CollectingReader extends MetricReader {
  protected override async onShutdown() {}
  protected override async onForceFlush() {}
}

export type HistogramPoint = { attributes: Record<string, unknown>; count: number; sum: number };

export function installTestTelemetry() {
  const spans = new InMemorySpanExporter();
  trace.setGlobalTracerProvider(
    new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(spans)] }),
  );
  const reader = new CollectingReader();
  metrics.setGlobalMeterProvider(new MeterProvider({ readers: [reader] }));

  return {
    /** Every span ended so far. */
    spans: () => spans.getFinishedSpans(),
    /** The data points of one histogram, by its name, as of now (cumulative). */
    async histogram(name: string): Promise<HistogramPoint[]> {
      const { resourceMetrics } = await reader.collect();
      const metric = resourceMetrics.scopeMetrics
        .flatMap((scope) => scope.metrics)
        .find((item) => item.descriptor.name === name) as HistogramMetricData | undefined;
      return (metric?.dataPoints ?? []).map((point) => ({
        attributes: point.attributes,
        count: point.value.count,
        sum: point.value.sum ?? 0,
      }));
    },
  };
}

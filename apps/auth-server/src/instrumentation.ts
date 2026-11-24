import { registerOTel } from "@vercel/otel";
import type { Instrumentation } from "next";
import { metricExportIntervalMillis, metricsExportEnabled } from "@/shared/telemetry/config";

// Traces: Next's request spans, Better Auth's endpoint and database spans, and this app's own
// spans for each auth step (shared/telemetry/trace-flow.ts). Metrics: each step's duration by
// outcome, and the web vitals browsers report. Both go to the OTLP endpoint the standard
// OTEL_EXPORTER_OTLP_* variables name at runtime; without one, nothing is exported.
export async function register() {
  const metricReaders =
    process.env.NEXT_RUNTIME === "nodejs" && metricsExportEnabled(process.env)
      ? await otlpMetricReaders()
      : [];
  registerOTel({
    serviceName: process.env.OTEL_SERVICE_NAME ?? "auth-server",
    ...(metricReaders.length > 0 ? { metricReaders } : {}),
  });
}

/** OTLP over HTTP (protobuf), which reads its endpoint and headers from the environment. */
async function otlpMetricReaders() {
  const [{ OTLPMetricExporter }, { PeriodicExportingMetricReader }] = await Promise.all([
    import("@opentelemetry/exporter-metrics-otlp-proto"),
    import("@opentelemetry/sdk-metrics"),
  ]);
  return [
    new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: metricExportIntervalMillis(process.env),
    }),
  ];
}

export const onRequestError: Instrumentation.onRequestError = (error, request, context) => {
  // One JSON line per unhandled error. The digest matches what error.tsx shows the user.
  console.error(
    JSON.stringify({
      level: "error",
      msg: error instanceof Error ? error.message : String(error),
      digest: (error as { digest?: string }).digest,
      method: request.method,
      path: request.path,
      routeType: context.routeType,
      routePath: context.routePath,
    }),
  );
};

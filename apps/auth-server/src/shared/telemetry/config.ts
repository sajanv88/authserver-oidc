// Whether metrics leave the process, from the standard OpenTelemetry variables. Pure (the
// environment is passed in): instrumentation.ts reads it before anything else runs, and the root
// layout reads it to decide whether browsers report web vitals at all.

type Source = Readonly<Record<string, string | undefined>>;

const DEFAULT_INTERVAL_MS = 60_000;

/**
 * True when an OTLP endpoint is set for metrics (OTEL_EXPORTER_OTLP_METRICS_ENDPOINT, or
 * OTEL_EXPORTER_OTLP_ENDPOINT for every signal), unless OTEL_SDK_DISABLED is "true" or
 * OTEL_METRICS_EXPORTER is "none".
 */
export function metricsExportEnabled(source: Source): boolean {
  if (source.OTEL_SDK_DISABLED?.trim().toLowerCase() === "true") return false;
  if (source.OTEL_METRICS_EXPORTER?.trim().toLowerCase() === "none") return false;
  return Boolean(
    source.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT?.trim() ||
      source.OTEL_EXPORTER_OTLP_ENDPOINT?.trim(),
  );
}

/** OTEL_METRIC_EXPORT_INTERVAL in milliseconds; a minute when it's unset or not a whole number. */
export function metricExportIntervalMillis(source: Source): number {
  const raw = source.OTEL_METRIC_EXPORT_INTERVAL?.trim();
  if (!raw || !/^\d+$/.test(raw)) return DEFAULT_INTERVAL_MS;
  const value = Number(raw);
  return value >= 1_000 ? value : DEFAULT_INTERVAL_MS;
}

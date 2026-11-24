import { describe, expect, it } from "vitest";
import { metricExportIntervalMillis, metricsExportEnabled } from "./config";

describe("metricsExportEnabled", () => {
  it("is off without an OTLP endpoint", () => {
    expect(metricsExportEnabled({})).toBe(false);
    expect(metricsExportEnabled({ OTEL_EXPORTER_OTLP_ENDPOINT: "  " })).toBe(false);
  });

  it("is on with the shared or the metrics endpoint", () => {
    expect(metricsExportEnabled({ OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector:4318" })).toBe(
      true,
    );
    expect(
      metricsExportEnabled({ OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: "http://collector:4318" }),
    ).toBe(true);
  });

  it("stays off when the SDK or the metrics exporter is turned off", () => {
    const endpoint = { OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector:4318" };
    expect(metricsExportEnabled({ ...endpoint, OTEL_SDK_DISABLED: "TRUE" })).toBe(false);
    expect(metricsExportEnabled({ ...endpoint, OTEL_METRICS_EXPORTER: "none" })).toBe(false);
    expect(metricsExportEnabled({ ...endpoint, OTEL_SDK_DISABLED: "false" })).toBe(true);
  });
});

describe("metricExportIntervalMillis", () => {
  it("is a minute unless a whole number of at least a second is set", () => {
    expect(metricExportIntervalMillis({})).toBe(60_000);
    expect(metricExportIntervalMillis({ OTEL_METRIC_EXPORT_INTERVAL: "15000" })).toBe(15_000);
    expect(metricExportIntervalMillis({ OTEL_METRIC_EXPORT_INTERVAL: "500" })).toBe(60_000);
    expect(metricExportIntervalMillis({ OTEL_METRIC_EXPORT_INTERVAL: "15s" })).toBe(60_000);
  });
});

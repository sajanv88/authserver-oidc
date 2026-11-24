"use client";

import { useReportWebVitals } from "next/web-vitals";
import { useEffect } from "react";
import {
  MAX_VITALS_PER_POST,
  VITALS_ENDPOINT,
  WEB_VITAL_RATINGS,
  WEB_VITALS,
  type WebVitalReport,
} from "./web-vital";

// Measurements wait here and go in one post when the page is hidden (closed, switched away
// from, navigated off), as web.dev recommends: LCP and CLS are only final by then.
const queue: WebVitalReport[] = [];

function flush() {
  if (queue.length === 0) return;
  const body = JSON.stringify(queue.splice(0, MAX_VITALS_PER_POST));
  // keepalive lets the post finish after the page has gone.
  fetch(VITALS_ENDPOINT, {
    method: "POST",
    body,
    keepalive: true,
    headers: { "content-type": "application/json" },
  }).catch(() => {
    // Telemetry is best effort: a lost measurement is never the visitor's problem.
  });
}

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

/** The path a measurement belongs to: its navigation's (soft navigations change the URL). */
function pathOf(navigationURL: unknown): string {
  try {
    return new URL(typeof navigationURL === "string" ? navigationURL : location.href, location.href)
      .pathname;
  } catch {
    return location.pathname;
  }
}

// Next's metric type isn't published, so each field is checked rather than trusted.
const report: Parameters<typeof useReportWebVitals>[0] = (metric: Record<string, unknown>) => {
  const { name, value, rating, navigationType, navigationURL } = metric;
  if (!isOneOf(WEB_VITALS, name) || typeof value !== "number") return;
  if (!isOneOf(WEB_VITAL_RATINGS, rating)) return;
  queue.push({
    name,
    value,
    rating,
    navigationType: typeof navigationType === "string" ? navigationType : "navigate",
    route: pathOf(navigationURL),
  });
  if (queue.length >= MAX_VITALS_PER_POST) flush();
};

/**
 * Reports LCP, INP, CLS, FCP and TTFB to the server, which records them as OpenTelemetry
 * metrics. The root layout renders it only when metrics are exported. Renders nothing.
 */
export function WebVitalsReporter() {
  useReportWebVitals(report);
  useEffect(() => {
    const whenHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", whenHidden);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", whenHidden);
      window.removeEventListener("pagehide", flush);
    };
  }, []);
  return null;
}

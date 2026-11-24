// What the browser reports and the server records, shared by both sides (no server-only code).

/** The route handler browsers post their web vitals to (src/app/api/vitals/route.ts). */
export const VITALS_ENDPOINT = "/api/vitals";

/** The Core Web Vitals and the two that explain them, each its own histogram. */
export const WEB_VITALS = ["LCP", "INP", "CLS", "FCP", "TTFB"] as const;
export type WebVitalName = (typeof WEB_VITALS)[number];

export const WEB_VITAL_RATINGS = ["good", "needs-improvement", "poor"] as const;

/** At most this many in one post; the browser sends sooner when it has this many. */
export const MAX_VITALS_PER_POST = 20;

/** One measurement, as posted. `route` is the page's path; the server maps it to a route. */
export type WebVitalReport = {
  name: WebVitalName;
  value: number;
  rating: (typeof WEB_VITAL_RATINGS)[number];
  navigationType: string;
  route: string;
};

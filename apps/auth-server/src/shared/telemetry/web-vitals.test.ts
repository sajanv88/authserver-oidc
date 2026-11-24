import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { installTestTelemetry } from "./testing";
import { KNOWN_ROUTES, receiveWebVitals, routeOf } from "./web-vitals";

const telemetry = installTestTelemetry();

const ORIGIN = "https://auth.example.com";

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}/api/vitals`, {
    method: "POST",
    headers: { origin: ORIGIN, "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const lcp = {
  name: "LCP",
  value: 1830,
  rating: "good",
  navigationType: "navigate",
  route: "/login",
};

describe("receiveWebVitals", () => {
  it("records each vital in its histogram, by route, rating and navigation type", async () => {
    const response = await receiveWebVitals(
      post([
        lcp,
        { ...lcp, route: "/signup/", value: 4200, rating: "poor", navigationType: "reload" },
        { name: "CLS", value: 0.02, rating: "good", navigationType: "navigate", route: "/login" },
      ]),
      ORIGIN,
    );
    expect(response.status).toBe(204);

    const points = await telemetry.histogram("browser.web_vital.lcp");
    expect(points).toContainEqual({
      attributes: {
        "http.route": "/login",
        "browser.web_vital.rating": "good",
        "browser.web_vital.navigation_type": "navigate",
      },
      count: 1,
      sum: 1830,
    });
    expect(points).toContainEqual(
      expect.objectContaining({
        attributes: {
          "http.route": "/signup",
          "browser.web_vital.rating": "poor",
          "browser.web_vital.navigation_type": "reload",
        },
        sum: 4200,
      }),
    );
    expect(await telemetry.histogram("browser.web_vital.cls")).toContainEqual(
      expect.objectContaining({ sum: 0.02 }),
    );
  });

  it("reduces paths and navigation types it doesn't know to other", async () => {
    await receiveWebVitals(
      post([{ ...lcp, name: "TTFB", route: "/wp-admin?x=1", navigationType: "teleport" }]),
      ORIGIN,
    );
    expect(await telemetry.histogram("browser.web_vital.ttfb")).toEqual([
      expect.objectContaining({
        attributes: expect.objectContaining({
          "http.route": "other",
          "browser.web_vital.navigation_type": "other",
        }),
      }),
    ]);
  });

  it("refuses posts from another origin, or none", async () => {
    expect(
      (await receiveWebVitals(post([lcp], { origin: "https://evil.test" }), ORIGIN)).status,
    ).toBe(403);
    const noOrigin = new Request(`${ORIGIN}/api/vitals`, {
      method: "POST",
      body: JSON.stringify([lcp]),
    });
    expect((await receiveWebVitals(noOrigin, ORIGIN)).status).toBe(403);
  });

  it("refuses big bodies and anything that isn't a short list of vitals", async () => {
    expect((await receiveWebVitals(post("x".repeat(5000)), ORIGIN)).status).toBe(413);
    expect((await receiveWebVitals(post("{not json"), ORIGIN)).status).toBe(400);
    expect((await receiveWebVitals(post([]), ORIGIN)).status).toBe(400);
    expect((await receiveWebVitals(post(Array(21).fill(lcp)), ORIGIN)).status).toBe(400);
    expect((await receiveWebVitals(post([{ ...lcp, name: "FID" }]), ORIGIN)).status).toBe(400);
    expect((await receiveWebVitals(post([{ ...lcp, value: -1 }]), ORIGIN)).status).toBe(400);
    expect((await receiveWebVitals(post([{ ...lcp, value: 1e9 }]), ORIGIN)).status).toBe(400);
    expect((await receiveWebVitals(post([{ ...lcp, rating: "great" }]), ORIGIN)).status).toBe(400);
  });
});

describe("routeOf", () => {
  it("keeps the app's own pages and drops trailing slashes", () => {
    expect(routeOf("/")).toBe("/");
    expect(routeOf("/admin/clients/")).toBe("/admin/clients");
    expect(routeOf("/admin/clients/123")).toBe("other");
  });

  it("knows every page in src/app", () => {
    const app = fileURLToPath(new URL("../../app/", import.meta.url));
    const pages = (readdirSync(app, { recursive: true }) as string[])
      .filter((file) => file.endsWith(`page.tsx`))
      .map((file) => {
        const segments = relative(app, join(app, file))
          .split(sep)
          .slice(0, -1)
          // Route groups like (auth) aren't part of the URL.
          .filter((segment) => !/^\(.+\)$/.test(segment));
        return `/${segments.join("/")}`;
      })
      .sort();
    expect([...KNOWN_ROUTES].sort()).toEqual(pages);
  });
});

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

  it("stops reading a body without a length, or longer than it says, past the cap", async () => {
    let pulled = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(1024).fill(32));
      },
    });
    const chunked = new Request(`${ORIGIN}/api/vitals`, {
      method: "POST",
      headers: { origin: ORIGIN },
      body: endless,
      duplex: "half",
    } as RequestInit);
    expect((await receiveWebVitals(chunked, ORIGIN)).status).toBe(413);
    expect(pulled).toBeLessThan(10);

    // Multi-byte characters: the cap counts bytes, not characters.
    const understated = post(`"${"é".repeat(2100)}"`, { "content-length": "10" });
    expect((await receiveWebVitals(understated, ORIGIN)).status).toBe(413);
  });

  it("refuses big bodies and anything that isn't a short list of vitals", async () => {
    expect((await receiveWebVitals(post("x".repeat(5000)), ORIGIN)).status).toBe(413);
    expect(
      (await receiveWebVitals(post([lcp], { "content-length": "99999" }), ORIGIN)).status,
    ).toBe(413);
    expect(
      (await receiveWebVitals(post([lcp], { "content-length": "12abc" }), ORIGIN)).status,
    ).toBe(413);
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
    // A user's page is one route, whoever's it is; the literal pattern isn't a path.
    expect(routeOf("/admin/users/6f1c1a1e-2b3c-4d5e-8f90-123456789abc")).toBe("/admin/users/[id]");
    expect(routeOf("/admin/users/[id]")).toBe("other");
    expect(routeOf("/admin/users/not-an-id")).toBe("other");
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

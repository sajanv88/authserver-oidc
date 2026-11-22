import { describe, expect, it } from "vitest";
import { SITEVERIFY_URL, turnstileHostnames, verifyTurnstileToken } from "./turnstile";

const config = { siteKey: "site-key", secretKey: "secret-key" };
const host = "auth.example.com";

/** A stand-in for Cloudflare: records what it's sent, answers `body`. */
function cloudflare(body: unknown, status = 200) {
  const sent: { url: string; body: unknown }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    sent.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return Response.json(body, { status });
  }) as typeof fetch;
  return { sent, fetchImpl };
}

describe("checking a Turnstile token directly (the admin's New client form)", () => {
  it("accepts a token Cloudflare accepts for this host, sending the secret and the token", async () => {
    const { sent, fetchImpl } = cloudflare({ success: true, hostname: host });
    expect(await verifyTurnstileToken(config, "token", [host], fetchImpl)).toBe(true);
    expect(sent).toEqual([
      { url: SITEVERIFY_URL, body: { secret: "secret-key", response: "token" } },
    ]);
  });

  it("refuses no token without asking, a rejected one, and one for another host", async () => {
    const none = cloudflare({ success: true, hostname: host });
    expect(await verifyTurnstileToken(config, undefined, [host], none.fetchImpl)).toBe(false);
    expect(none.sent).toEqual([]);

    const rejected = cloudflare({ success: false, "error-codes": ["invalid-input-response"] });
    expect(await verifyTurnstileToken(config, "token", [host], rejected.fetchImpl)).toBe(false);

    const elsewhere = cloudflare({ success: true, hostname: "phishing.example" });
    expect(await verifyTurnstileToken(config, "token", [host], elsewhere.fetchImpl)).toBe(false);
  });

  it("refuses when Cloudflare fails, answers nonsense, or can't be reached", async () => {
    const failing = cloudflare({ success: true, hostname: host }, 500);
    expect(await verifyTurnstileToken(config, "token", [host], failing.fetchImpl)).toBe(false);

    const nonsense = cloudflare("not json we know");
    expect(await verifyTurnstileToken(config, "token", [host], nonsense.fetchImpl)).toBe(false);

    const unreachable = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    expect(await verifyTurnstileToken(config, "token", [host], unreachable)).toBe(false);
  });

  it("checks the host only in production: Cloudflare's test keys report example.com", async () => {
    const testKey = cloudflare({ success: true, hostname: "example.com" });
    expect(await verifyTurnstileToken(config, "token", undefined, testKey.fetchImpl)).toBe(true);
    expect(turnstileHostnames({ isProduction: false, betterAuthUrl: `https://${host}` })).toBe(
      undefined,
    );
    expect(turnstileHostnames({ isProduction: true, betterAuthUrl: `https://${host}` })).toEqual([
      host,
    ]);
  });
});

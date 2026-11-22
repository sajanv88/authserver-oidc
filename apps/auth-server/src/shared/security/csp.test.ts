import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, createNonce } from "./csp";

function directives(policy: string): Map<string, string> {
  return new Map(
    policy.split("; ").map((directive) => {
      const [name = "", ...values] = directive.split(" ");
      return [name, values.join(" ")];
    }),
  );
}

describe("content security policy", () => {
  const production = directives(buildContentSecurityPolicy({ nonce: "abc123", isDev: false }));
  const development = directives(buildContentSecurityPolicy({ nonce: "abc123", isDev: true }));

  it("allows only nonce'd scripts in production: no unsafe-inline, no unsafe-eval", () => {
    expect(production.get("script-src")).toBe("'self' 'nonce-abc123' 'strict-dynamic'");
    expect(production.get("style-src")).toBe("'self' 'nonce-abc123'");
  });

  it("keeps nuvui's one allowance, style attributes, and nothing broader", () => {
    expect(production.get("style-src-attr")).toBe("'unsafe-inline'");
    expect([...production.values()].join(" ")).not.toMatch(/\*/);
  });

  it("can't be framed, post forms elsewhere, or load plugins", () => {
    expect(production.get("frame-ancestors")).toBe("'none'");
    expect(production.get("form-action")).toBe("'self'");
    expect(production.get("object-src")).toBe("'none'");
    expect(production.get("base-uri")).toBe("'self'");
    expect(production.get("connect-src")).toBe("'self'");
  });

  it("relaxes only scripts' eval and inline styles in development", () => {
    expect(development.get("script-src")).toContain("'unsafe-eval'");
    expect(development.get("style-src")).toContain("'unsafe-inline'");
    expect(development.get("frame-ancestors")).toBe("'none'");
  });

  it("allows Cloudflare Turnstile's script and iframe only when it's configured", () => {
    const withTurnstile = directives(
      buildContentSecurityPolicy({ nonce: "abc123", isDev: false, turnstile: true }),
    );
    expect(withTurnstile.get("script-src")).toBe(
      "'self' 'nonce-abc123' 'strict-dynamic' https://challenges.cloudflare.com",
    );
    expect(withTurnstile.get("frame-src")).toBe("https://challenges.cloudflare.com");
    expect(withTurnstile.get("frame-ancestors")).toBe("'none'");
    expect(withTurnstile.get("connect-src")).toBe("'self'");
    expect(production.has("frame-src")).toBe(false);
  });

  it("makes a fresh, 128-bit nonce each time", () => {
    const nonces = new Set(Array.from({ length: 50 }, () => createNonce()));
    expect(nonces.size).toBe(50);
    for (const nonce of nonces) expect(Buffer.from(nonce, "base64")).toHaveLength(16);
  });
});

// The pieces on their own: settings, return paths, cookies, sealing, ID token checks.
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, UnsecuredJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { APP_URL, CLIENT_ID, ISSUER, SECRET } from "../test/fake-issuer.js";
import { resolveConfig } from "./config.js";
import {
  applySetCookies,
  CHUNK_SIZE,
  clearCookie,
  parseCookies,
  readCookie,
  writeCookie,
} from "./cookies.js";
import { isIdpError } from "./errors.js";
import { verifyIdToken } from "./id-token.js";
import { safePath } from "./return-path.js";
import { Sealer } from "./sealed.js";

describe("settings", () => {
  const minimal = { issuer: ISSUER, clientId: CLIENT_ID, appUrl: APP_URL, secret: SECRET, env: {} };

  it("derives the redirect URI, post-logout URI and cookie names", () => {
    const config = resolveConfig({
      ...minimal,
      issuer: `${ISSUER}/`,
      basePath: "/oidc",
      afterSignOut: "/bye",
    });
    expect(config).toMatchObject({
      issuer: ISSUER,
      redirectUri: `${APP_URL}/oidc/callback`,
      postLogoutRedirectUri: `${APP_URL}/bye`,
      scope: "openid profile email offline_access",
      secure: true,
      cookies: { session: "__Host-nextidp.session", flow: "__Host-nextidp.flow" },
    });
    const local = resolveConfig({ ...minimal, appUrl: "http://app.localtest.me:3001" });
    expect(local.cookies.session).toBe("nextidp.session");
    expect(local.secure).toBe(false);
  });

  it("reads IDP_* when an option isn't passed, and an option wins", () => {
    const env = {
      IDP_ISSUER: ISSUER,
      IDP_CLIENT_ID: "from-env",
      IDP_APP_URL: APP_URL,
      IDP_SECRET: `${SECRET},${SECRET}-old`,
      IDP_SCOPES: "openid email",
      IDP_CLIENT_SECRET: " ",
    };
    const config = resolveConfig({ env, clientId: "from-option" });
    expect(config.clientId).toBe("from-option");
    expect(config.secrets).toEqual([SECRET, `${SECRET}-old`]);
    expect(config.scope).toBe("openid email");
    // Blank counts as unset: a public client.
    expect(config.clientSecret).toBeUndefined();
  });

  it("names every setting that's wrong, without repeating values", () => {
    let message = "";
    try {
      resolveConfig({
        env: { NODE_ENV: "production" },
        issuer: "http://auth.example.test",
        appUrl: "https://app.example.test/app",
        secret: "short",
        scopes: ["email"],
        basePath: "auth/",
        afterSignIn: "https://evil.example",
      });
    } catch (error) {
      expect(isIdpError(error) && error.code).toBe("misconfigured");
      message = (error as Error).message;
    }
    for (const part of [
      "issuer (IDP_ISSUER) must be https in production",
      "appUrl (IDP_APP_URL) must be an origin",
      "clientId (IDP_CLIENT_ID) is required",
      "secret (IDP_SECRET) must be at least 32 characters",
      "scopes (IDP_SCOPES) must include openid",
      "basePath must be a path",
      "afterSignIn must be a path of this app",
    ]) {
      expect(message).toContain(part);
    }
    expect(message).not.toContain("short");
  });
});

describe("safePath", () => {
  it.each(["/", "/a/b?c=1#d", "/consent?client_id=a"])("keeps %s", (path) => {
    expect(safePath(path)).toBe(path);
  });

  it.each([
    "//evil.example",
    "/\\evil.example",
    "https://evil.example/",
    "javascript:alert(1)",
    "evil",
    "",
    "/a\nb",
    undefined,
    42,
  ])("refuses %s", (value) => {
    expect(safePath(value)).toBeUndefined();
  });
});

describe("cookies", () => {
  const attributes = { secure: true, maxAge: 60 };

  it("parses a Cookie header, keeping the first of a name sent twice", () => {
    expect([...parseCookies('a=1; b="2"; a=3; =x; c')]).toEqual([
      ["a", "1"],
      ["b", "2"],
    ]);
  });

  it("writes a small value as one cookie and expires chunks left from a bigger one", () => {
    const jar = parseCookies("s.0=x; s.1=y; other=z");
    expect(writeCookie(jar, "s", "small", attributes)).toEqual([
      "s=small; Path=/; Max-Age=60; HttpOnly; SameSite=Lax; Secure",
      "s.0=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure",
      "s.1=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; Secure",
    ]);
  });

  it("splits a big value, reads it back whole, and expires the single cookie it replaces", () => {
    const value = "v".repeat(CHUNK_SIZE * 2 + 5);
    const headers = writeCookie(parseCookies("s=old"), "s", value, attributes);
    expect(headers.map((line) => line.split("=")[0])).toEqual(["s.0", "s.1", "s.2", "s"]);
    const browser = applySetCookies("s=old", headers);
    expect(readCookie(parseCookies(browser), "s")).toBe(value);
  });

  it("clears every chunk the browser holds", () => {
    expect(clearCookie(parseCookies("s.0=a; s.1=b; s.x=c"), "s", false)).toEqual([
      "s=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax",
      "s.0=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax",
      "s.1=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax",
    ]);
  });
});

describe("sealing", () => {
  it("opens what it sealed, for that purpose only, and nothing altered or expired", async () => {
    const sealer = new Sealer([SECRET]);
    const sealed = await sealer.seal({ a: 1 }, "session", 60);
    expect(await sealer.unseal(sealed, "session")).toMatchObject({ a: 1 });
    expect(await sealer.unseal(sealed, "flow")).toBeUndefined();
    expect(await sealer.unseal(`${sealed.slice(0, -2)}AA`, "session")).toBeUndefined();
    expect(
      await sealer.unseal(await sealer.seal({ a: 1 }, "session", -1), "session"),
    ).toBeUndefined();
    expect(
      await new Sealer(["another secret of thirty-two characters!"]).unseal(sealed, "session"),
    ).toBeUndefined();
  });

  it("seals with the first secret and opens with any", async () => {
    const old = await new Sealer([SECRET]).seal({ a: 1 }, "session", 60);
    const rotated = new Sealer(["the new secret, at least thirty-two chars", SECRET]);
    expect(await rotated.unseal(old, "session")).toMatchObject({ a: 1 });
    const fresh = await rotated.seal({ b: 2 }, "session", 60);
    expect(await new Sealer([SECRET]).unseal(fresh, "session")).toBeUndefined();
  });
});

describe("ID token checks", () => {
  let keys: ReturnType<typeof createLocalJWKSet>;
  let sign: (
    claims: Record<string, unknown>,
    options?: { exp?: string; aud?: string | string[] },
  ) => Promise<string>;

  beforeAll(async () => {
    const pair = await generateKeyPair("RS256");
    keys = createLocalJWKSet({
      keys: [{ ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256" }],
    });
    sign = (claims, options = {}) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: "RS256", kid: "k1" })
        .setIssuer(ISSUER)
        .setAudience(options.aud ?? CLIENT_ID)
        .setSubject("u1")
        .setIssuedAt()
        .setExpirationTime(options.exp ?? "10m")
        .sign(pair.privateKey);
  });

  const check = { issuer: ISSUER, clientId: CLIENT_ID, nonce: "n1" };
  const refused = (token: string, overrides = {}) =>
    expect(verifyIdToken(token, keys, { ...check, ...overrides })).rejects.toMatchObject({
      code: "invalid_id_token",
    });

  it("accepts the issuer's signature for this client with this sign-in's nonce", async () => {
    expect(await verifyIdToken(await sign({ nonce: "n1" }), keys, check)).toMatchObject({
      sub: "u1",
    });
  });

  it("refuses a wrong or missing nonce, another audience or issuer, or an expired token", async () => {
    await refused(await sign({ nonce: "n2" }));
    await refused(await sign({}));
    await refused(await sign({ nonce: "n1" }), { clientId: "someone-else" });
    await refused(await sign({ nonce: "n1" }), { issuer: "https://evil.example" });
    await refused(await sign({ nonce: "n1" }, { exp: "-2m" }));
  });

  it("with several audiences, wants azp to be this client", async () => {
    await refused(await sign({ nonce: "n1" }, { aud: [CLIENT_ID, "other"] }));
    expect(
      await verifyIdToken(
        await sign({ nonce: "n1", azp: CLIENT_ID }, { aud: [CLIENT_ID, "other"] }),
        keys,
        check,
      ),
    ).toMatchObject({ azp: CLIENT_ID });
  });

  it("refuses an unsigned token, even if discovery lists none", async () => {
    const unsigned = new UnsecuredJWT({ nonce: "n1", sub: "u1" })
      .setIssuer(ISSUER)
      .setAudience(CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime("10m")
      .encode();
    await refused(unsigned, { algorithms: ["none", "RS256"] });
  });

  it("after a refresh, accepts a token without a nonce", async () => {
    expect(await verifyIdToken(await sign({}), keys, { ...check, nonce: undefined })).toMatchObject(
      { sub: "u1" },
    );
  });
});

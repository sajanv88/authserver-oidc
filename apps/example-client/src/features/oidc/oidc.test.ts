// The OIDC client's checks, without a network: PKCE, the encrypted cookies, discovery and
// ID-token verification against keys made here.
import { createHash } from "node:crypto";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { sealFlow, sealSession, unsealFlow, unsealSession } from "./server/app-session";
import { parseDiscovery } from "./server/discovery";
import { endSessionUrl } from "./server/end-session";
import { verifyIdToken } from "./server/id-token";
import { challengeFor, randomToken, sameString } from "./server/pkce";
import { seal, unseal } from "./server/sealed-cookie";

const secret = "a test secret that is at least thirty-two characters";
const issuer = "http://auth.localtest.me:3000";
const clientId = "example-client-id";

describe("PKCE", () => {
  it("is base64url(SHA-256(verifier)), as Node computes it independently", async () => {
    const verifier = randomToken();
    expect(await challengeFor(verifier)).toBe(
      createHash("sha256").update(verifier).digest("base64url"),
    );
  });

  it("makes 256-bit tokens in the verifier alphabet, different every time", () => {
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(token);
  });

  it("compares states exactly", () => {
    expect(sameString("abc", "abc")).toBe(true);
    expect(sameString("abc", "abd")).toBe(false);
    expect(sameString("abc", "abcd")).toBe(false);
  });
});

describe("encrypted cookies", () => {
  const flow = { verifier: "v", state: "s", nonce: "n" };

  it("round-trips, and refuses another secret, another purpose or an altered value", async () => {
    const sealed = await sealFlow(flow, secret);
    expect(await unsealFlow(sealed, secret)).toEqual(flow);
    expect(await unsealFlow(sealed, `${secret}x`)).toBeUndefined();
    // A sign-in cookie isn't a session cookie, even with the same secret.
    expect(await unsealSession(sealed, secret)).toBeUndefined();
    expect(await unsealFlow(`${sealed.slice(0, -2)}AA`, secret)).toBeUndefined();
    expect(await unsealFlow(undefined, secret)).toBeUndefined();
  });

  it("refuses an expired one", async () => {
    const sealed = await seal(flow, { secret, purpose: "oidc-flow", maxAgeSeconds: -1 });
    expect(await unseal(sealed, { secret, purpose: "oidc-flow" })).toBeUndefined();
  });

  it("keeps the session's tokens", async () => {
    const session = {
      claims: { sub: "u1", iss: issuer },
      accessToken: "at",
      accessTokenExpiresAt: 1_800_000_000,
      refreshToken: "rt",
      idToken: "header.payload.signature",
    };
    expect(await unsealSession(await sealSession(session, secret), secret)).toEqual(session);
  });
});

describe("discovery", () => {
  const document = {
    issuer,
    authorization_endpoint: `${issuer}/api/auth/oauth2/authorize`,
    token_endpoint: `${issuer}/api/auth/oauth2/token`,
    userinfo_endpoint: `${issuer}/api/auth/oauth2/userinfo`,
    jwks_uri: `${issuer}/jwks`,
  };

  it("takes a document for the issuer it was fetched for, and no other", () => {
    expect(parseDiscovery(document, issuer).jwks_uri).toBe(`${issuer}/jwks`);
    expect(() => parseDiscovery(document, "https://other.example.com")).toThrow(/issuer/);
    expect(() => parseDiscovery({ issuer }, issuer)).toThrow();
  });

  it("takes the end-session endpoint when the server has one", () => {
    const endpoint = `${issuer}/api/auth/oauth2/end-session`;
    expect(
      parseDiscovery({ ...document, end_session_endpoint: endpoint }, issuer).end_session_endpoint,
    ).toBe(endpoint);
    expect(parseDiscovery(document, issuer).end_session_endpoint).toBeUndefined();
  });
});

describe("signing out of the auth server too", () => {
  it("sends the ID token as the hint, with the client and the registered way back", () => {
    const url = endSessionUrl(
      `${issuer}/api/auth/oauth2/end-session`,
      { clientId, postLogoutRedirectUri: "http://app.localtest.me:3001/" },
      "header.payload.signature",
    );
    expect(`${url.origin}${url.pathname}`).toBe(`${issuer}/api/auth/oauth2/end-session`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      id_token_hint: "header.payload.signature",
      client_id: clientId,
      post_logout_redirect_uri: "http://app.localtest.me:3001/",
    });
  });
});

describe("ID token verification", () => {
  let keys: ReturnType<typeof createLocalJWKSet>;
  let sign: (
    claims: Record<string, unknown>,
    options?: { exp?: string; kid?: string },
  ) => Promise<string>;
  let forge: typeof sign;

  beforeAll(async () => {
    const real = await generateKeyPair("RS256");
    const other = await generateKeyPair("RS256");
    const jwk = { ...(await exportJWK(real.publicKey)), kid: "k1", alg: "RS256" };
    keys = createLocalJWKSet({ keys: [jwk] });
    const signer =
      (key: CryptoKey) =>
      (claims: Record<string, unknown>, options: { exp?: string } = {}) =>
        new SignJWT(claims)
          .setProtectedHeader({ alg: "RS256", kid: "k1" })
          .setIssuer(issuer)
          .setAudience(clientId)
          .setSubject("u1")
          .setIssuedAt()
          .setExpirationTime(options.exp ?? "10m")
          .sign(key);
    sign = signer(real.privateKey);
    forge = signer(other.privateKey);
  });

  const check = (nonce?: string) => ({ keys, issuer, clientId, nonce });

  it("accepts the issuer's signature with the right audience and nonce", async () => {
    const claims = await verifyIdToken(await sign({ nonce: "n1" }), check("n1"));
    expect(claims).toMatchObject({ sub: "u1", iss: issuer, aud: clientId, nonce: "n1" });
  });

  it("refuses a wrong nonce, a missing one, another signer, or an expired token", async () => {
    await expect(verifyIdToken(await sign({ nonce: "n2" }), check("n1"))).rejects.toThrow(/nonce/);
    await expect(verifyIdToken(await sign({}), check("n1"))).rejects.toThrow(/nonce/);
    await expect(verifyIdToken(await forge({ nonce: "n1" }), check("n1"))).rejects.toThrow();
    await expect(
      verifyIdToken(await sign({ nonce: "n1" }, { exp: "-1m" }), check("n1")),
    ).rejects.toThrow();
  });

  it("refuses a token for another client or from another issuer", async () => {
    const token = await sign({ nonce: "n1" });
    await expect(
      verifyIdToken(token, { ...check("n1"), clientId: "someone-else" }),
    ).rejects.toThrow();
    await expect(
      verifyIdToken(token, { ...check("n1"), issuer: "https://evil.example.com" }),
    ).rejects.toThrow();
  });

  it("after a refresh, accepts a token without a nonce", async () => {
    expect(await verifyIdToken(await sign({}), check())).toMatchObject({ sub: "u1" });
  });
});

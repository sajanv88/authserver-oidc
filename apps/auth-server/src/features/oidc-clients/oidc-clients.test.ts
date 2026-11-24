// The oidc-clients feature against the real auth configuration (PGlite): its form rules, and
// the server functions its actions call, as admins and as someone who isn't one.
import { createHash, randomBytes } from "node:crypto";
import type { OAuthClientSummary } from "@repo/db";
import { beforeAll, describe, expect, it } from "vitest";
import { APP_ORIGIN, BASE_URL, createHarness, linkIn } from "@/shared/auth/test-harness";
import { parseForm } from "@/shared/validation/field-errors";
import { CreateClientSchema, redirectUriLines, UpdateClientSchema } from "./schemas/client";
import {
  createClient,
  deleteClient,
  rotateClientSecret,
  toClientRow,
  updateClient,
} from "./server/clients";

type Harness = Awaited<ReturnType<typeof createHarness>>;
type Browser = ReturnType<Harness["browser"]>;

const password = "correct horse battery staple";
const redirectUri = `${APP_ORIGIN}/oidc/callback`;

describe("create-client form rules", () => {
  it("reads one redirect URI per line, ignoring blank lines and spaces", () => {
    expect(redirectUriLines(" https://a.example.com/cb \r\n\n https://b.example.com/cb\n")).toEqual(
      ["https://a.example.com/cb", "https://b.example.com/cb"],
    );
    expect(
      parseForm(CreateClientSchema, {
        name: " Example app ",
        kind: "public",
        redirectUris: "https://a.example.com/cb",
      }),
    ).toEqual({
      ok: true,
      value: { name: "Example app", kind: "public", redirectUris: ["https://a.example.com/cb"] },
    });
  });

  it("asks for a name, a kind and full addresses without a fragment", () => {
    expect(parseForm(CreateClientSchema, { name: " ", kind: "other", redirectUris: "" })).toEqual({
      ok: false,
      errors: {
        name: "Give the app a name.",
        kind: "Choose the kind of app.",
        redirectUris: "Add at least one redirect URI.",
      },
    });
    for (const redirectUris of ["app.example.com/cb", "https://a.example.com/cb#x", "ftp://x/y"]) {
      expect(
        parseForm(CreateClientSchema, { name: "A", kind: "public", redirectUris }),
      ).toMatchObject({ ok: false, errors: { redirectUris: expect.stringMatching(/in full/) } });
    }
    const eleven = Array.from({ length: 11 }, (_, i) => `https://a.example.com/${i}`).join("\n");
    expect(
      parseForm(CreateClientSchema, { name: "A", kind: "public", redirectUris: eleven }),
    ).toMatchObject({ ok: false, errors: { redirectUris: "Add at most 10 redirect URIs." } });
  });

  it("edits the name and redirect URIs with the same rules, and needs the client ID", () => {
    expect(
      parseForm(UpdateClientSchema, {
        clientId: "abc",
        name: " Renamed ",
        redirectUris: "https://a.example.com/cb\nhttps://b.example.com/cb",
      }),
    ).toEqual({
      ok: true,
      value: {
        clientId: "abc",
        name: "Renamed",
        redirectUris: ["https://a.example.com/cb", "https://b.example.com/cb"],
      },
    });
    expect(parseForm(UpdateClientSchema, { clientId: "", name: "", redirectUris: "x" })).toEqual({
      ok: false,
      errors: {
        clientId: expect.any(String),
        name: "Give the app a name.",
        redirectUris: expect.stringMatching(/in full/),
      },
    });
  });

  it("lists a client by kind, without its secret", () => {
    const createdAt = new Date("2026-11-21T10:00:00Z");
    const summary: OAuthClientSummary = {
      id: "1",
      clientId: "abc",
      name: null,
      tokenEndpointAuthMethod: "none",
      redirectUris: [redirectUri],
      scopes: null,
      disabled: false,
      createdAt,
    };
    expect(toClientRow(summary)).toEqual({
      clientId: "abc",
      name: "abc",
      kind: "public",
      redirectUris: [redirectUri],
      disabled: false,
      createdAt: "2026-11-21T10:00:00.000Z",
    });
    expect(toClientRow({ ...summary, tokenEndpointAuthMethod: null }).kind).toBe("confidential");
  });
});

describe("managing clients", () => {
  let h: Harness;
  let first: Headers;
  let second: Headers;
  let user: Headers;
  let ada: Browser;

  async function signUp(email: string, ip: string): Promise<Browser> {
    const browser = h.browser(ip);
    await browser.request("POST", "/api/auth/sign-up/email", {
      json: { email, password, name: "User" },
    });
    await browser.request("GET", linkIn(h.emails.at(-1)));
    return browser;
  }

  const cookies = (browser: Browser) =>
    new Headers({ cookie: [...browser.jar].map(([name, value]) => `${name}=${value}`).join("; ") });

  beforeAll(async () => {
    h = await createHarness();
    const a = await signUp("first@example.com", "203.0.113.130");
    const b = await signUp("second@example.com", "203.0.113.131");
    await h.sql("update users set role = 'admin' where email in ($1, $2)", [
      "first@example.com",
      "second@example.com",
    ]);
    first = cookies(a);
    second = cookies(b);
    ada = await signUp("ada@example.com", "203.0.113.132");
    user = cookies(ada);
  });

  /** Ada signs in to the client and allows it: the code and the PKCE verifier to redeem it. */
  async function codeFor(clientId: string): Promise<{ code: string; verifier: string }> {
    const verifier = randomBytes(32).toString("base64url");
    const query = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: "openid offline_access",
      state: "st",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    });
    const authorize = await ada.request("GET", `/api/auth/oauth2/authorize?${query}`);
    const location = new URL(authorize.headers.get("location") ?? "", BASE_URL);
    // Allowed before: straight back to the app.
    const direct = location.searchParams.get("code");
    if (direct) return { code: direct, verifier };
    const answer = (await (
      await ada.request("POST", "/api/auth/oauth2/consent", {
        json: { accept: true, oauth_query: location.search.slice(1) },
      })
    ).json()) as { url: string };
    return { code: new URL(answer.url).searchParams.get("code") ?? "", verifier };
  }

  function redeem(clientId: string, clientSecret: string, code: string, verifier: string) {
    return h.auth.handler(
      new Request(`${BASE_URL}/api/auth/oauth2/token`, {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
          "content-type": "application/x-www-form-urlencoded",
          "x-forwarded-for": "198.51.100.60",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          code_verifier: verifier,
          redirect_uri: redirectUri,
        }).toString(),
      }),
    );
  }

  it("creates a public client: no secret, PKCE required, refresh tokens allowed", async () => {
    const result = await createClient(h.auth, first, {
      name: "Single-page app",
      kind: "public",
      redirectUris: [redirectUri],
    });
    if (!result.ok) throw new Error(result.problem);
    expect(result.value.clientSecret).toBeUndefined();
    const { rows } = await h.sql(
      "select client_secret, token_endpoint_auth_method, require_pkce, grant_types, reference_id from oauth_clients where client_id = $1",
      [result.value.clientId],
    );
    expect(rows).toEqual([
      {
        client_secret: null,
        token_endpoint_auth_method: "none",
        require_pkce: true,
        grant_types: ["authorization_code", "refresh_token"],
        reference_id: "admins",
      },
    ]);
    // Nothing to rotate.
    expect(await rotateClientSecret(h.auth, first, result.value.clientId)).toEqual({
      ok: false,
      problem: "not-confidential",
    });
  });

  it("creates a confidential client whose secret is stored hashed, and any admin rotates it", async () => {
    const created = await createClient(h.auth, first, {
      name: "Server app",
      kind: "confidential",
      redirectUris: [redirectUri],
    });
    if (!created.ok) throw new Error(created.problem);
    const { clientId, clientSecret: oldSecret = "" } = created.value;
    expect(oldSecret).not.toBe("");
    const { rows } = await h.sql(
      "select client_secret, require_pkce from oauth_clients where client_id = $1",
      [clientId],
    );
    expect(rows[0]).toMatchObject({ require_pkce: true });
    expect((rows[0] as { client_secret: string }).client_secret).not.toContain(oldSecret);

    // Another admin rotates it: the new secret works, the old one doesn't.
    const rotated = await rotateClientSecret(h.auth, second, clientId);
    if (!rotated.ok) throw new Error(rotated.problem);
    const newSecret = rotated.value.clientSecret ?? "";
    expect(newSecret).not.toBe(oldSecret);

    const before = await codeFor(clientId);
    expect((await redeem(clientId, oldSecret, before.code, before.verifier)).status).toBe(401);
    const after = await codeFor(clientId);
    const tokens = await redeem(clientId, newSecret, after.code, after.verifier);
    expect(tokens.status).toBe(200);
    expect(await tokens.json()).toHaveProperty("refresh_token");
  });

  it("refuses a non-loopback http:// redirect URI with a message for the field", async () => {
    expect(
      await createClient(h.auth, first, {
        name: "X",
        kind: "public",
        redirectUris: ["http://evil.example.com/cb"],
      }),
    ).toEqual({ ok: false, problem: "invalid-redirect-uri" });
  });

  it("lets any admin rename a client and change its redirect URIs, keeping its kind", async () => {
    const created = await createClient(h.auth, first, {
      name: "Before",
      kind: "confidential",
      redirectUris: [redirectUri],
    });
    if (!created.ok) throw new Error(created.problem);
    const { clientId } = created.value;
    const uris = [redirectUri, `${APP_ORIGIN}/oidc/callback-2`];

    expect(
      await updateClient(h.auth, second, { clientId, name: "After", redirectUris: uris }),
    ).toEqual({ ok: true, value: null });
    const { rows } = await h.sql(
      "select name, redirect_uris, token_endpoint_auth_method, client_secret is not null as has_secret from oauth_clients where client_id = $1",
      [clientId],
    );
    expect(rows).toEqual([
      {
        name: "After",
        redirect_uris: uris,
        token_endpoint_auth_method: "client_secret_basic",
        has_secret: true,
      },
    ]);
  });

  it("refuses an edit with a non-loopback http:// redirect URI, or of a missing client", async () => {
    const created = await createClient(h.auth, first, {
      name: "Strict",
      kind: "public",
      redirectUris: [redirectUri],
    });
    if (!created.ok) throw new Error(created.problem);
    expect(
      await updateClient(h.auth, first, {
        clientId: created.value.clientId,
        name: "Strict",
        redirectUris: ["http://evil.example.com/cb"],
      }),
    ).toEqual({ ok: false, problem: "invalid-redirect-uri" });
    expect(
      await updateClient(h.auth, first, {
        clientId: "no-such-client",
        name: "X",
        redirectUris: [redirectUri],
      }),
    ).toEqual({ ok: false, problem: "not-found" });
  });

  it("lets only admins create, rotate or delete", async () => {
    const created = await createClient(h.auth, first, {
      name: "Guarded",
      kind: "confidential",
      redirectUris: [redirectUri],
    });
    if (!created.ok) throw new Error(created.problem);
    const input = { name: "Mine", kind: "public" as const, redirectUris: [redirectUri] };
    expect((await createClient(h.auth, user, input)).ok).toBe(false);
    expect((await rotateClientSecret(h.auth, user, created.value.clientId)).ok).toBe(false);
    expect((await deleteClient(h.auth, user, created.value.clientId)).ok).toBe(false);
    const edit = { clientId: created.value.clientId, name: "Taken", redirectUris: [redirectUri] };
    expect((await updateClient(h.auth, user, edit)).ok).toBe(false);
    expect((await updateClient(h.auth, new Headers(), edit)).ok).toBe(false);
    const { rows } = await h.sql("select name from oauth_clients where client_id = $1", [
      created.value.clientId,
    ]);
    expect(rows).toEqual([{ name: "Guarded" }]);
    expect((await deleteClient(h.auth, new Headers(), created.value.clientId)).ok).toBe(false);
  });

  it("deletes a client with its consents and tokens; it can't start a sign-in any more", async () => {
    const created = await createClient(h.auth, first, {
      name: "Short-lived",
      kind: "confidential",
      redirectUris: [redirectUri],
    });
    if (!created.ok) throw new Error(created.problem);
    const { clientId, clientSecret = "" } = created.value;
    const { code, verifier } = await codeFor(clientId);
    expect((await redeem(clientId, clientSecret, code, verifier)).status).toBe(200);

    expect(await deleteClient(h.auth, second, clientId)).toEqual({ ok: true, value: null });
    for (const table of ["oauth_consents", "oauth_access_tokens", "oauth_refresh_tokens"]) {
      const { rows } = await h.sql(`select 1 from ${table} where client_id = $1`, [clientId]);
      expect(rows).toEqual([]);
    }
    const authorize = await ada.request(
      "GET",
      `/api/auth/oauth2/authorize?${new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: "openid",
        code_challenge: createHash("sha256").update("x").digest("base64url"),
        code_challenge_method: "S256",
      })}`,
    );
    expect(authorize.headers.get("location") ?? "").not.toMatch(/[?&]code=/);
    expect(await deleteClient(h.auth, second, clientId)).toEqual({
      ok: false,
      problem: "not-found",
    });
  });
});

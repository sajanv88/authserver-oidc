// A small OpenID provider for the tests, behind a stubbed fetch: discovery, JWKS, the token
// endpoint (authorization code with PKCE S256, refresh with rotation), revocation and
// userinfo. Codes are handed out by `issueCode`, as the auth server would after sign-in.
// For APIs: `accessToken` mints a JWT access token the way the auth server's OAuth plugin
// does (typ at+jwt, aud, client_id, azp, scope, jti), and `opaqueToken` registers one for the
// introspection endpoint, which answers API_CLIENT_ID with API_CLIENT_SECRET only. The same
// client gets service tokens (client credentials); the scope `forbidden` is refused.
import { createHash, randomBytes } from "node:crypto";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

export const ISSUER = "https://auth.example.test";
export const CLIENT_ID = "client-123";
export const APP_URL = "https://app.example.test";
export const SECRET = "a test secret that is at least thirty-two characters long";
export const API_URL = "https://api.example.test";
export const API_CLIENT_ID = "api-client";
export const API_CLIENT_SECRET = "api-client-secret";

type Code = {
  challenge: string;
  nonce: string;
  clientId: string;
  redirectUri: string;
  sub: string;
};
type Recorded = { url: string; method: string; body: string; headers: Headers };

export type FakeIssuer = Awaited<ReturnType<typeof fakeIssuer>>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function fakeIssuer(options: { endSession?: boolean; userinfo?: boolean } = {}) {
  const real = await generateKeyPair("RS256");
  const other = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(real.publicKey)), kid: "k1", alg: "RS256", use: "sig" };

  const codes = new Map<string, Code>();
  const opaque = new Map<string, Record<string, unknown>>();
  const refreshTokens = new Map<string, { sub: string }>();
  const requests: Recorded[] = [];
  const settings = {
    /** Make the token endpoint answer this status with `{ error }` instead. */
    tokenFailure: undefined as { status: number; error: string } | undefined,
    /** Send an ID token on refresh, for this subject. */
    refreshIdTokenSub: undefined as string | undefined,
    /** Sign ID tokens with a key that isn't in the JWKS. */
    forge: false,
    /** Extra claims in every ID token. */
    extraClaims: {} as Record<string, unknown>,
    accessTokenLifetime: 600,
    /** How long a service token (client credentials) lasts. */
    serviceTokenLifetime: 600 as number | undefined,
    /** false: ID tokens carry no email or name, as authserver-oidc's (they're in userinfo). */
    profileInIdToken: true,
    /** What userinfo answers instead of its default, with this status. */
    userinfo: undefined as Record<string, unknown> | undefined,
    userinfoStatus: 200,
  };

  const random = () => randomBytes(16).toString("base64url");

  const idToken = (claims: Record<string, unknown>) =>
    new SignJWT({ ...settings.extraClaims, ...claims })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(ISSUER)
      .setAudience(CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(settings.forge ? other.privateKey : real.privateKey);

  /**
   * A back-channel logout token, as the auth server's plugin sends one: typ logout+jwt, `aud`
   * this client, the logout event, `sid` and `sub`. `claims` adds to or (with undefined)
   * removes from them.
   */
  const logoutToken = (
    claims: Record<string, unknown> = {},
    options: { typ?: string | null; forge?: boolean; exp?: string } = {},
  ) => {
    const header: { alg: string; kid: string; typ?: string } = { alg: "RS256", kid: "k1" };
    if (options.typ !== null) header.typ = options.typ ?? "logout+jwt";
    const payload: Record<string, unknown> = {
      sub: "user-1",
      sid: "idp-session-1",
      jti: random(),
      events: { "http://schemas.openid.net/event/backchannel-logout": {} },
      ...claims,
    };
    for (const [name, value] of Object.entries(payload)) {
      if (value === undefined) delete payload[name];
    }
    return new SignJWT(payload)
      .setProtectedHeader(header)
      .setIssuer(ISSUER)
      .setAudience(typeof claims.aud === "string" ? claims.aud : CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime(options.exp ?? "2m")
      .sign(options.forge ? other.privateKey : real.privateKey);
  };

  /** A JWT access token, as the auth server's plugin makes one for a `resource`. */
  const accessToken = (
    claims: Record<string, unknown> = {},
    options: { typ?: string | null; forge?: boolean; exp?: string; aud?: string | string[] } = {},
  ) => {
    const header: { alg: string; kid: string; typ?: string } = { alg: "RS256", kid: "k1" };
    if (options.typ !== null) header.typ = options.typ ?? "at+jwt";
    return new SignJWT({
      sub: "user-1",
      client_id: CLIENT_ID,
      azp: CLIENT_ID,
      scope: "openid orders:read",
      jti: random(),
      ...claims,
    })
      .setProtectedHeader(header)
      .setIssuer(ISSUER)
      .setAudience(options.aud ?? [API_URL, `${ISSUER}/api/auth/oauth2/userinfo`])
      .setIssuedAt()
      .setExpirationTime(options.exp ?? "10m")
      .sign(options.forge ? other.privateKey : real.privateKey);
  };

  const tokens = async (sub: string, nonce?: string) => {
    const refreshToken = random();
    refreshTokens.set(refreshToken, { sub });
    return {
      access_token: random(),
      token_type: "Bearer",
      expires_in: settings.accessTokenLifetime,
      refresh_token: refreshToken,
      scope: "openid profile email offline_access",
      id_token: await idToken({
        sub,
        ...(settings.profileInIdToken ? { email: `${sub}@example.test`, name: "Pat" } : {}),
        ...(nonce ? { nonce } : {}),
      }),
    };
  };

  async function token(form: URLSearchParams, headers: Headers): Promise<Response> {
    if (settings.tokenFailure) {
      return json({ error: settings.tokenFailure.error }, settings.tokenFailure.status);
    }
    if (form.get("grant_type") === "authorization_code") {
      const code = codes.get(form.get("code") ?? "");
      codes.delete(form.get("code") ?? "");
      const verifier = form.get("code_verifier") ?? "";
      const challenge = createHash("sha256").update(verifier).digest("base64url");
      if (!code || code.challenge !== challenge || code.redirectUri !== form.get("redirect_uri")) {
        return json({ error: "invalid_grant" }, 400);
      }
      return json(await tokens(code.sub, code.nonce));
    }
    if (form.get("grant_type") === "refresh_token") {
      const presented = form.get("refresh_token") ?? "";
      const holder = refreshTokens.get(presented);
      if (!holder) return json({ error: "invalid_grant" }, 400);
      // Rotation: the old one stops working.
      refreshTokens.delete(presented);
      const fresh = await tokens(holder.sub);
      const { id_token, ...rest } = fresh;
      return json(
        settings.refreshIdTokenSub
          ? { ...rest, id_token: await idToken({ sub: settings.refreshIdTokenSub }) }
          : rest,
      );
    }
    if (form.get("grant_type") === "client_credentials") {
      // A confidential client only, with Basic: API_CLIENT_ID and API_CLIENT_SECRET.
      if (
        headers.get("authorization") !== `Basic ${btoa(`${API_CLIENT_ID}:${API_CLIENT_SECRET}`)}`
      ) {
        return json({ error: "invalid_client" }, 401);
      }
      const scope = form.get("scope") ?? "";
      if (scope.split(" ").includes("forbidden")) return json({ error: "invalid_scope" }, 400);
      return json({
        access_token: random(),
        token_type: "Bearer",
        ...(settings.serviceTokenLifetime === undefined
          ? {}
          : { expires_in: settings.serviceTokenLifetime }),
        ...(scope ? { scope } : {}),
      });
    }
    return json({ error: "unsupported_grant_type" }, 400);
  }

  const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const body = request.method === "GET" ? "" : await request.text();
    requests.push({ url: request.url, method: request.method, body, headers: request.headers });
    switch (`${request.method} ${url.origin}${url.pathname}`) {
      case `GET ${ISSUER}/.well-known/openid-configuration`:
        return json({
          issuer: ISSUER,
          authorization_endpoint: `${ISSUER}/authorize`,
          token_endpoint: `${ISSUER}/token`,
          ...(options.userinfo === false ? {} : { userinfo_endpoint: `${ISSUER}/userinfo` }),
          jwks_uri: `${ISSUER}/jwks`,
          revocation_endpoint: `${ISSUER}/revoke`,
          introspection_endpoint: `${ISSUER}/introspect`,
          ...(options.endSession === false
            ? {}
            : { end_session_endpoint: `${ISSUER}/end-session` }),
          id_token_signing_alg_values_supported: ["RS256"],
        });
      case `GET ${ISSUER}/jwks`:
        return json({ keys: [jwk] });
      case `POST ${ISSUER}/token`:
        return token(new URLSearchParams(body), request.headers);
      case `POST ${ISSUER}/revoke`:
        refreshTokens.delete(new URLSearchParams(body).get("token") ?? "");
        return new Response(null, { status: 200 });
      case `POST ${ISSUER}/introspect`: {
        const basic = `Basic ${btoa(`${API_CLIENT_ID}:${API_CLIENT_SECRET}`)}`;
        if (request.headers.get("authorization") !== basic) {
          return json({ error: "invalid_client" }, 401);
        }
        const claims = opaque.get(new URLSearchParams(body).get("token") ?? "");
        return json(claims ? { active: true, iss: ISSUER, ...claims } : { active: false });
      }
      case `GET ${ISSUER}/userinfo`: {
        const bearer = request.headers.get("authorization");
        if (!bearer?.startsWith("Bearer ")) return json({ error: "invalid_token" }, 401);
        return json(
          settings.userinfo ?? { sub: "user-1", email: "user-1@example.test" },
          settings.userinfoStatus,
        );
      }
      default:
        return json({ error: "not_found" }, 404);
    }
  };

  return {
    fetch,
    settings,
    accessToken,
    logoutToken,
    /** An opaque access token the introspection endpoint knows, with these claims. */
    opaqueToken(claims: Record<string, unknown>): string {
      const token = random();
      opaque.set(token, {
        scope: "orders:read",
        client_id: CLIENT_ID,
        sub: "user-1",
        exp: Math.floor(Date.now() / 1000) + 600,
        ...claims,
      });
      return token;
    },
    /** Revokes an opaque token: introspection answers inactive from now on. */
    revoke(token: string) {
      opaque.delete(token);
    },
    requests,
    refreshTokens,
    /** A code for the sign-in an authorize URL started, as the auth server would issue it. */
    issueCode(authorizeUrl: string, sub = "user-1", overrides: { nonce?: string } = {}): string {
      const params = new URL(authorizeUrl).searchParams;
      const code = random();
      codes.set(code, {
        challenge: params.get("code_challenge") ?? "",
        nonce: overrides.nonce ?? params.get("nonce") ?? "",
        clientId: params.get("client_id") ?? "",
        redirectUri: params.get("redirect_uri") ?? "",
        sub,
      });
      return code;
    },
    /** How many times an endpoint was called. */
    calls(path: string, method = "POST"): Recorded[] {
      return requests.filter((r) => r.method === method && new URL(r.url).pathname === path);
    },
  };
}

/** A browser's cookie jar, enough for the tests: Set-Cookie in, Cookie header out. */
export class Browser {
  readonly cookies = new Map<string, string>();

  take(response: Response): Response {
    for (const line of response.headers.getSetCookie()) {
      const [pair = ""] = line.split(";");
      const index = pair.indexOf("=");
      const name = pair.slice(0, index);
      if (/;\s*Max-Age=0(;|$)/i.test(line)) this.cookies.delete(name);
      else this.cookies.set(name, pair.slice(index + 1));
    }
    return response;
  }

  get header(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  get(url: string): Request {
    return new Request(url, { headers: { cookie: this.header } });
  }

  post(url: string, fields: Record<string, string> = {}, origin = APP_URL): Request {
    return new Request(url, {
      method: "POST",
      headers: { cookie: this.header, origin, "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString(),
    });
  }
}

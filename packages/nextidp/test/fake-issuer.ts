// A small OpenID provider for the tests, behind a stubbed fetch: discovery, JWKS, the token
// endpoint (authorization code with PKCE S256, refresh with rotation), revocation and
// userinfo. Codes are handed out by `issueCode`, as the auth server would after sign-in.
import { createHash, randomBytes } from "node:crypto";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

export const ISSUER = "https://auth.example.test";
export const CLIENT_ID = "client-123";
export const APP_URL = "https://app.example.test";
export const SECRET = "a test secret that is at least thirty-two characters long";

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

export async function fakeIssuer(options: { endSession?: boolean } = {}) {
  const real = await generateKeyPair("RS256");
  const other = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(real.publicKey)), kid: "k1", alg: "RS256", use: "sig" };

  const codes = new Map<string, Code>();
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
        email: `${sub}@example.test`,
        name: "Pat",
        ...(nonce ? { nonce } : {}),
      }),
    };
  };

  async function token(form: URLSearchParams): Promise<Response> {
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
          userinfo_endpoint: `${ISSUER}/userinfo`,
          jwks_uri: `${ISSUER}/jwks`,
          revocation_endpoint: `${ISSUER}/revoke`,
          ...(options.endSession === false
            ? {}
            : { end_session_endpoint: `${ISSUER}/end-session` }),
          id_token_signing_alg_values_supported: ["RS256"],
        });
      case `GET ${ISSUER}/jwks`:
        return json({ keys: [jwk] });
      case `POST ${ISSUER}/token`:
        return token(new URLSearchParams(body));
      case `POST ${ISSUER}/revoke`:
        refreshTokens.delete(new URLSearchParams(body).get("token") ?? "");
        return new Response(null, { status: 200 });
      case `GET ${ISSUER}/userinfo`: {
        const bearer = request.headers.get("authorization");
        return bearer?.startsWith("Bearer ")
          ? json({ sub: "user-1", email: "user-1@example.test" })
          : json({ error: "invalid_token" }, 401);
      }
      default:
        return json({ error: "not_found" }, 404);
    }
  };

  return {
    fetch,
    settings,
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

import "server-only";
import { cookies } from "next/headers";
import { connection, type NextRequest, NextResponse } from "next/server";
import * as v from "valibot";
import { OIDC_SCOPES } from "@/shared/config/app";
import { env } from "@/shared/config/env";
import type { ExampleEnv } from "@/shared/config/env-schema";
import {
  type AppSession,
  cookieNames,
  FLOW_MAX_AGE,
  SESSION_MAX_AGE,
  sealFlow,
  sealSession,
  unsealFlow,
  unsealSession,
} from "./app-session";
import { discover } from "./discovery";
import { endSessionUrl } from "./end-session";
import { remoteKeys, verifyIdToken } from "./id-token";
import { challengeFor, randomToken, sameString } from "./pkce";
import { exchangeCode, refreshTokens, revokeRefreshToken, type TokenResponse } from "./tokens";

// The OIDC client, as four route handlers: start a sign-in, finish it, refresh the tokens,
// sign out. Codes in ?error= are what the home page explains.

export type SignInError =
  | "access_denied"
  | "expired"
  | "state_mismatch"
  | "token_failed"
  | "invalid_id_token"
  | "refresh_failed";

function home(config: ExampleEnv, error?: SignInError): NextResponse {
  const url = new URL("/", config.appUrl);
  if (error) url.searchParams.set("error", error);
  // 303: a POST is followed by a GET.
  return NextResponse.redirect(url, 303);
}

function client(config: ExampleEnv) {
  return { clientId: config.clientId, clientSecret: config.clientSecret };
}

function sessionCookie(config: ExampleEnv) {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}

/** The session to store from a token response; its ID token verified already. */
function toSession(tokens: TokenResponse, claims: AppSession["claims"]): AppSession {
  return {
    claims,
    accessToken: tokens.access_token,
    accessTokenExpiresAt: Math.floor(Date.now() / 1000) + (tokens.expires_in ?? 0),
    ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
    ...(tokens.id_token ? { idToken: tokens.id_token } : {}),
  };
}

/** GET /oidc/login: a new verifier, state and nonce, kept encrypted; off to the auth server. */
export async function startSignIn(): Promise<NextResponse> {
  const config = env();
  const discovery = await discover(config.authServerUrl);
  const flow = { verifier: randomToken(), state: randomToken(), nonce: randomToken() };

  const authorize = new URL(discovery.authorization_endpoint);
  authorize.search = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: OIDC_SCOPES,
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: await challengeFor(flow.verifier),
    code_challenge_method: "S256",
  }).toString();

  const response = NextResponse.redirect(authorize);
  response.cookies.set(
    cookieNames(config.isProduction).flow,
    await sealFlow(flow, config.sessionSecret),
    {
      httpOnly: true,
      secure: config.isProduction,
      // Lax: the cookie comes back on the top-level redirect from the auth server.
      sameSite: "lax",
      path: "/oidc",
      maxAge: FLOW_MAX_AGE,
    },
  );
  return response;
}

/** GET /oidc/callback: state, then the code for tokens, then the ID token, then the session. */
export async function finishSignIn(request: NextRequest): Promise<NextResponse> {
  const config = env();
  const names = cookieNames(config.isProduction);
  const flow = await unsealFlow(request.cookies.get(names.flow)?.value, config.sessionSecret);
  const params = request.nextUrl.searchParams;

  const respond = (response: NextResponse) => {
    // The sign-in in progress is used up, whatever happened.
    response.cookies.set(names.flow, "", { path: "/oidc", maxAge: 0 });
    return response;
  };

  if (!flow) return respond(home(config, "expired"));
  const state = params.get("state") ?? "";
  // Only this browser's own sign-in may finish here (CSRF on the redirect URI).
  if (!sameString(state, flow.state)) return respond(home(config, "state_mismatch"));
  if (params.get("error")) {
    return respond(
      home(config, params.get("error") === "access_denied" ? "access_denied" : "token_failed"),
    );
  }
  const code = params.get("code");
  if (!code) return respond(home(config, "token_failed"));

  const discovery = await discover(config.authServerUrl);
  let tokens: TokenResponse;
  try {
    tokens = await exchangeCode(discovery, client(config), {
      code,
      verifier: flow.verifier,
      redirectUri: config.redirectUri,
    });
  } catch (error) {
    console.error("example-client: code exchange failed", error);
    return respond(home(config, "token_failed"));
  }

  let claims: AppSession["claims"];
  try {
    if (!tokens.id_token) throw new Error("No ID token: was openid asked for?");
    claims = await verifyIdToken(tokens.id_token, {
      keys: remoteKeys(discovery.jwks_uri),
      issuer: discovery.issuer,
      clientId: config.clientId,
      nonce: flow.nonce,
    });
  } catch (error) {
    console.error("example-client: ID token rejected", error);
    return respond(home(config, "invalid_id_token"));
  }

  const response = respond(NextResponse.redirect(new URL("/me", config.appUrl)));
  response.cookies.set(
    names.session,
    await sealSession(toSession(tokens, claims), config.sessionSecret),
    sessionCookie(config),
  );
  return response;
}

/** Cookie-authenticated POSTs come from this app's own pages only. */
function fromThisApp(request: NextRequest, config: ExampleEnv): boolean {
  return request.headers.get("origin") === config.appUrl;
}

/** POST /oidc/refresh: rotates the refresh token for a new access token. */
export async function refreshSession(request: NextRequest): Promise<NextResponse> {
  const config = env();
  if (!fromThisApp(request, config)) return new NextResponse(null, { status: 403 });
  const names = cookieNames(config.isProduction);
  const session = await unsealSession(
    request.cookies.get(names.session)?.value,
    config.sessionSecret,
  );
  if (!session?.refreshToken) return home(config, "refresh_failed");

  const discovery = await discover(config.authServerUrl);
  try {
    const tokens = await refreshTokens(discovery, client(config), session.refreshToken);
    // A new ID token, if one came back, must be for the same person (OIDC Core 12.2).
    let claims = session.claims;
    if (tokens.id_token) {
      const fresh = await verifyIdToken(tokens.id_token, {
        keys: remoteKeys(discovery.jwks_uri),
        issuer: discovery.issuer,
        clientId: config.clientId,
      });
      if (fresh.sub !== session.claims.sub) throw new Error("A different subject came back.");
      claims = fresh;
    }
    const next = toSession(tokens, claims);
    const response = NextResponse.redirect(new URL("/me?refreshed=1", config.appUrl), 303);
    response.cookies.set(
      names.session,
      await sealSession(
        {
          ...next,
          // The server may not send these again: keep what we had.
          ...(next.refreshToken ? {} : { refreshToken: session.refreshToken }),
          ...(next.idToken || !session.idToken ? {} : { idToken: session.idToken }),
        },
        config.sessionSecret,
      ),
      sessionCookie(config),
    );
    return response;
  } catch (error) {
    console.error("example-client: refresh failed", error);
    const response = home(config, "refresh_failed");
    response.cookies.set(names.session, "", { path: "/", maxAge: 0 });
    return response;
  }
}

/** Which of the sign-out buttons was pressed; this app only unless it says otherwise. */
const SignOutSchema = v.object({
  where: v.optional(v.picklist(["app", "everywhere"]), "app"),
});

/**
 * POST /oidc/logout: forgets this app's session and revokes its refresh token. With
 * `where=everywhere`, then sends the browser to the auth server to sign out there too, which
 * comes back to the home page.
 */
export async function signOut(request: NextRequest): Promise<NextResponse> {
  const config = env();
  if (!fromThisApp(request, config)) return new NextResponse(null, { status: 403 });
  const form = v.safeParse(SignOutSchema, Object.fromEntries(await request.formData()));
  const where = form.success ? form.output.where : "app";
  const names = cookieNames(config.isProduction);
  const session = await unsealSession(
    request.cookies.get(names.session)?.value,
    config.sessionSecret,
  );
  const discovery = await discover(config.authServerUrl);
  if (session?.refreshToken) {
    await revokeRefreshToken(discovery, client(config), session.refreshToken);
  }
  const response =
    where === "everywhere" && session?.idToken && discovery.end_session_endpoint
      ? // 303: the browser follows a POST with a GET.
        NextResponse.redirect(
          endSessionUrl(discovery.end_session_endpoint, config, session.idToken),
          303,
        )
      : home(config);
  response.cookies.set(names.session, "", { path: "/", maxAge: 0 });
  return response;
}

export async function getAppSession(): Promise<AppSession | undefined> {
  // Per request, before the clock is read (the cookie's expiry): dev's prerender check
  // flags it otherwise.
  await connection();
  const config = env();
  const value = (await cookies()).get(cookieNames(config.isProduction).session)?.value;
  return unsealSession(value, config.sessionSecret);
}

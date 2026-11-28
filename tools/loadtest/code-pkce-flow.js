// An app's sign-in, end to end: authorization code with PKCE (S256), as a browser and the app
// would do it, as a random seeded user.
//
//   k6 run -e ISSUER=… -e CLIENT_ID=… -e REDIRECT_URI=… -e PASSWORD=… [-e SPOOF_IP=1] code-pkce-flow.js
//
// The steps, each tagged by name so its latency shows on its own:
//   authorize     GET  /api/auth/oauth2/authorize          302 to /login with a signed query
//   login_page    GET  /login?<signed query>               the page itself (PAGES=0 skips it)
//   sign_in       POST /api/auth/sign-in/email             with oauth_query: where the flow goes on
//   consent_page  GET  /consent?<signed query>             only the first time a user meets the app
//   consent       POST /api/auth/oauth2/consent            accept, with oauth_query
//   token         POST /api/auth/oauth2/token              the code and the PKCE verifier
//   userinfo      GET  /api/auth/oauth2/userinfo           USERINFO=0 skips it
//
// The login and consent forms post to Next.js server actions, which call sign_in and consent
// in-process with exactly these JSON bodies (shared/auth/endpoint.ts). k6 calls the endpoints
// themselves; the server action requests can't be reproduced reliably (see the README).
import { check } from "k6";
import crypto from "k6/crypto";
import encoding from "k6/encoding";
import http from "k6/http";
import { Counter } from "k6/metrics";
import {
  API,
  absolute,
  basicAuth,
  captchaHeaders,
  clientHeaders,
  form,
  ISSUER,
  queryOf,
  record,
  required,
  seededUser,
  setting,
  staircase,
} from "./lib/common.js";

const CLIENT_ID = required("CLIENT_ID");
// Must be one the client registered, exactly. Nothing is ever sent to it: the code is read
// from the redirect the server answers with.
const REDIRECT_URI = required("REDIRECT_URI");
// Only for a confidential client. The seed's example client is public (PKCE only).
const CLIENT_SECRET = setting("CLIENT_SECRET", undefined);
const SCOPE = setting("SCOPE", "openid profile email offline_access");
const RESOURCE = setting("RESOURCE", undefined);
const PAGES = setting("PAGES", "1") === "1";
// Userinfo takes the opaque token issued without a resource. With RESOURCE the token is a JWT
// for that API, so it's skipped unless USERINFO=1 says otherwise.
const USERINFO = setting("USERINFO", RESOURCE ? "0" : "1") === "1";

const STEPS = [
  "authorize",
  "login_page",
  "sign_in",
  "consent_page",
  "consent",
  "token",
  "userinfo",
];
const stepP95 = Number(setting("STEP_P95_MS", "1000"));

/** How many flows met the consent screen: a user's first sign-in to the app only. */
const consentShown = new Counter("consent_shown");

export const options = staircase({
  // Five to seven requests, one of them a scrypt hash.
  secondsPerIteration: 2,
  p95: 1000,
  // One threshold per step, so the summary lists each step's latency.
  extraThresholds: Object.fromEntries(
    STEPS.map((step) => [`http_req_duration{name:${step}}`, [`p(95)<${stepP95}`]]),
  ),
});

function json(response) {
  try {
    return response.json();
  } catch {
    return {};
  }
}

/** A browser loading a page: the server answers navigations differently from fetches. */
const NAVIGATION = {
  accept: "text/html,application/xhtml+xml",
  "sec-fetch-mode": "navigate",
  "sec-fetch-dest": "document",
};

export default function () {
  // One client address for the whole flow, as one browser would have.
  const client = clientHeaders();
  const user = seededUser();
  try {
    signInToApp(client, user);
  } finally {
    // A new browser next time: no session carried from one iteration to the next.
    http.cookieJar().clear(ISSUER);
  }
}

function signInToApp(client, user) {
  // PKCE: a random verifier, and its SHA-256 as the challenge (base64url, no padding).
  const verifier = encoding.b64encode(crypto.randomBytes(32), "rawurl");
  const challenge = crypto.sha256(verifier, "base64rawurl");
  const state = encoding.b64encode(crypto.randomBytes(16), "rawurl");
  const nonce = encoding.b64encode(crypto.randomBytes(16), "rawurl");

  // 1. The app sends the browser to authorize. Signed out, the server sends it on to /login,
  //    with the request in a signed query (sig, exp) that the next steps carry unchanged.
  const authorizeQuery = form({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: RESOURCE,
  });
  const authorize = record(
    http.get(`${API}/oauth2/authorize?${authorizeQuery}`, {
      headers: { ...NAVIGATION, ...client },
      redirects: 0,
      tags: { name: "authorize" },
    }),
    "authorize",
  );
  const loginUrl = absolute(authorize.headers.Location ?? "");
  const signedQuery = loginUrl.includes("?") ? loginUrl.slice(loginUrl.indexOf("?") + 1) : "";
  const toLogin = check(authorize, {
    "authorize: 302": (r) => r.status === 302,
    "authorize: to /login": () => loginUrl.startsWith(`${ISSUER}/login?`),
    "authorize: a signed query": () => Boolean(queryOf(loginUrl).sig),
  });
  if (!toLogin) {
    // An error for the app (an unknown client, a redirect URI it didn't register…) comes back
    // on the redirect URI: say which.
    const error = queryOf(loginUrl).error;
    if (error)
      console.warn(`authorize refused: ${error} ${queryOf(loginUrl).error_description ?? ""}`);
    return;
  }

  // 2. The login page, as the browser loads it.
  if (PAGES) {
    const page = record(
      http.get(loginUrl, { headers: { ...NAVIGATION, ...client }, tags: { name: "login_page" } }),
      "login_page",
    );
    check(page, { "login_page: 200": (r) => r.status === 200 });
  }

  // 3. Email and password, with the signed query as oauth_query: on success Better Auth goes on
  //    with the app's request and says where to (consent, or the app's redirect URI).
  const signIn = record(
    http.post(
      `${API}/sign-in/email`,
      JSON.stringify({
        email: user.email,
        password: user.password,
        rememberMe: false,
        oauth_query: signedQuery,
      }),
      {
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          origin: ISSUER,
          ...client,
          ...captchaHeaders(),
        },
        tags: { name: "sign_in" },
      },
    ),
    "sign_in",
  );
  const signedIn = json(signIn);
  const signInOk = check(signIn, {
    "sign_in: 200": (r) => r.status === 200,
    "sign_in: no second factor asked": () => signedIn.twoFactorRedirect !== true,
    "sign_in: goes on with the flow": () =>
      signedIn.redirect === true && typeof signedIn.url === "string",
  });
  if (!signInOk) return;
  let next = absolute(signedIn.url);

  // 4. Consent, the first time this user meets the app (Better Auth remembers it after).
  if (next.startsWith(`${ISSUER}/consent?`)) {
    consentShown.add(1);
    const consentQuery = next.slice(next.indexOf("?") + 1);
    if (PAGES) {
      const page = record(
        http.get(next, { headers: { ...NAVIGATION, ...client }, tags: { name: "consent_page" } }),
        "consent_page",
      );
      check(page, { "consent_page: 200": (r) => r.status === 200 });
    }
    const consent = record(
      http.post(
        `${API}/oauth2/consent`,
        JSON.stringify({ accept: true, oauth_query: consentQuery }),
        {
          headers: {
            "content-type": "application/json",
            accept: "application/json",
            origin: ISSUER,
            ...client,
          },
          tags: { name: "consent" },
        },
      ),
      "consent",
    );
    const answer = json(consent);
    const consented = check(consent, {
      "consent: 200": (r) => r.status === 200,
      "consent: a way back to the app": () => typeof answer.url === "string",
    });
    if (!consented) return;
    next = absolute(answer.url);
  }

  // 5. Back at the app: the code, and the same state, from this server.
  const back = queryOf(next);
  const gotCode = check(next, {
    "callback: to the redirect URI": (url) => url.startsWith(`${REDIRECT_URI}?`),
    "callback: a code": () => Boolean(back.code),
    "callback: the same state": () => back.state === state,
    "callback: iss is the issuer": () => back.iss === undefined || back.iss === ISSUER,
  });
  if (!gotCode) {
    if (back.error) console.warn(`flow refused: ${back.error} ${back.error_description ?? ""}`);
    return;
  }

  // 6. The app exchanges the code, with the verifier only it knows.
  const tokenHeaders = {
    "content-type": "application/x-www-form-urlencoded",
    accept: "application/json",
    ...client,
  };
  if (CLIENT_SECRET) tokenHeaders.authorization = basicAuth(CLIENT_ID, CLIENT_SECRET);
  const token = record(
    http.post(
      `${API}/oauth2/token`,
      form({
        grant_type: "authorization_code",
        code: back.code,
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier,
        // A public client names itself; a confidential one did in the Basic header.
        client_id: CLIENT_SECRET ? undefined : CLIENT_ID,
        resource: RESOURCE,
      }),
      { headers: tokenHeaders, tags: { name: "token" } },
    ),
    "token",
  );
  const tokens = json(token);
  const scopes = SCOPE.split(" ");
  const gotTokens = check(token, {
    "token: 200": (r) => r.status === 200,
    "token: an access token": () => typeof tokens.access_token === "string",
    "token: an ID token": () => !scopes.includes("openid") || typeof tokens.id_token === "string",
    "token: a refresh token for offline_access": () =>
      !scopes.includes("offline_access") || typeof tokens.refresh_token === "string",
  });
  if (!gotTokens || !USERINFO) return;

  // 7. What the app asks next, about the person.
  const userinfo = record(
    http.get(`${API}/oauth2/userinfo`, {
      headers: { authorization: `Bearer ${tokens.access_token}`, ...client },
      tags: { name: "userinfo" },
    }),
    "userinfo",
  );
  const profile = json(userinfo);
  check(userinfo, {
    "userinfo: 200": (r) => r.status === 200,
    "userinfo: the person's email": () => !scopes.includes("email") || profile.email === user.email,
  });
}

// Email and password sign-in, outside any app's flow, as a random seeded user.
//
//   k6 run -e ISSUER=… -e PASSWORD=… [-e USERS=10000] [-e SPOOF_IP=1] password-signin.js
//
// The server's login form posts to a Next.js server action, which calls this same endpoint
// in-process with the same JSON (shared/auth/endpoint.ts). k6 calls the endpoint itself:
// the server action's own request can't be reproduced reliably (see the README).
//
// The endpoint allows 5 sign-ins a minute per client address: without SPOOF_IP=1, nearly
// every request past the fifth is a 429. Each sign-in runs one scrypt hash on the server.
import { check } from "k6";
import http from "k6/http";
import {
  API,
  captchaHeaders,
  clientHeaders,
  ISSUER,
  record,
  seededUser,
  setting,
  staircase,
} from "./lib/common.js";

export const options = staircase({
  // scrypt is the cost: tens of milliseconds of CPU per sign-in, more when the pool is busy.
  secondsPerIteration: 1,
  p95: 1000,
});

export default function () {
  const user = seededUser();
  const headers = {
    "content-type": "application/json",
    accept: "application/json",
    // Better Auth checks the Origin of every POST against its trusted origins; the login form
    // is the server's own page.
    origin: ISSUER,
    ...clientHeaders(),
    ...captchaHeaders(),
  };

  const response = record(
    http.post(
      `${API}/sign-in/email`,
      JSON.stringify({ email: user.email, password: user.password, rememberMe: false }),
      { headers, tags: { name: "sign_in" } },
    ),
    "sign_in",
  );
  let body = {};
  try {
    body = response.json();
  } catch {
    // Not JSON: the checks below fail and say so.
  }
  check(response, {
    "sign_in: 200": (r) => r.status === 200,
    "sign_in: a user": () => Boolean(body.user?.id),
    "sign_in: no second factor asked": () => body.twoFactorRedirect !== true,
    "sign_in: a session cookie": (r) =>
      Object.keys(r.cookies).some((name) => name.includes("session_token")),
  });

  // Optional: end the session, so the sessions table doesn't grow by one row per sign-in.
  if (setting("SIGN_OUT", "0") === "1" && response.status === 200) {
    const out = record(
      http.post(`${API}/sign-out`, "{}", {
        headers: { "content-type": "application/json", origin: ISSUER, ...clientHeaders() },
        tags: { name: "sign_out" },
      }),
      "sign_out",
    );
    check(out, { "sign_out: 200": (r) => r.status === 200 });
  }

  // A new browser next time: no session carried from one iteration to the next.
  http.cookieJar().clear(ISSUER);
}

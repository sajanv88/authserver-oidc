// Client credentials at the token endpoint: a service asking for an access token as itself.
//
//   k6 run -e ISSUER=… -e CLIENT_ID=… -e CLIENT_SECRET=… [-e SCOPE=…] [-e RESOURCE=…] token-endpoint.js
//
// AUTH_METHOD=basic (default) sends the credentials as HTTP Basic, AUTH_METHOD=post in the form
// body. A client may use only the method it was registered with, and every machine client this
// server creates (admin screen, provisioning) is client_secret_basic: with post, those get
// invalid_client.
import { check } from "k6";
import http from "k6/http";
import {
  API,
  basicAuth,
  clientHeaders,
  form,
  record,
  required,
  setting,
  staircase,
} from "./lib/common.js";

const CLIENT_ID = required("CLIENT_ID");
const CLIENT_SECRET = required("CLIENT_SECRET");
const AUTH_METHOD = setting("AUTH_METHOD", "basic");
if (AUTH_METHOD !== "basic" && AUTH_METHOD !== "post") {
  throw new Error("AUTH_METHOD must be basic or post.");
}

export const options = staircase({
  // One request: a hashed secret to check and a token to sign and store.
  secondsPerIteration: 0.5,
  p95: 300,
});

export default function () {
  const headers = {
    "content-type": "application/x-www-form-urlencoded",
    accept: "application/json",
    ...clientHeaders(),
  };
  const fields = {
    grant_type: "client_credentials",
    scope: setting("SCOPE", undefined),
    // RFC 8707: a JWT for this API, with it as `aud`. Without it, an opaque token.
    resource: setting("RESOURCE", undefined),
  };
  if (AUTH_METHOD === "basic") headers.authorization = basicAuth(CLIENT_ID, CLIENT_SECRET);
  else Object.assign(fields, { client_id: CLIENT_ID, client_secret: CLIENT_SECRET });

  const response = record(
    http.post(`${API}/oauth2/token`, form(fields), { headers, tags: { name: "token" } }),
    "token",
  );
  let body = {};
  try {
    body = response.json();
  } catch {
    // Not JSON: the checks below fail and say so.
  }
  check(response, {
    "token: 200": (r) => r.status === 200,
    "token: an access token": () => typeof body.access_token === "string",
    "token: Bearer": () => String(body.token_type).toLowerCase() === "bearer",
    "token: expires_in": () => typeof body.expires_in === "number",
    "token: no refresh token for a service": () => body.refresh_token === undefined,
  });
}

// What every k6 script here shares: settings from __ENV, the staircase of arrival rates, the
// 429 and 5xx counters, spoofed client addresses, and the seeded users.
import encoding from "k6/encoding";
import http from "k6/http";
import { Counter } from "k6/metrics";

/** A setting, or its default. Empty counts as unset. */
export function setting(name, fallback) {
  const value = __ENV[name];
  return value === undefined || value === "" ? fallback : value;
}

/** A setting that must be given: stops the test at start-up, not halfway. */
export function required(name) {
  const value = setting(name, undefined);
  if (value === undefined) throw new Error(`${name} is required (k6 run -e ${name}=…).`);
  return value;
}

export function numberSetting(name, fallback) {
  const value = Number(setting(name, String(fallback)));
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number.`);
  return value;
}

/** The auth server's public base URL: BETTER_AUTH_URL, which is also the issuer. */
export const ISSUER = required("ISSUER").replace(/\/+$/, "");
export const API = `${ISSUER}/api/auth`;

// 429s and 5xx are counted apart from http_req_failed, so a run shows whether it hit the rate
// limiter or the server gave way. Tagged by step (`name`).
export const rateLimited = new Counter("http_429");
export const serverErrors = new Counter("http_5xx");

// Redirects are part of every flow here, never failures: only 4xx and 5xx count in
// http_req_failed.
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 399 }));

/** Counts a response in http_429 / http_5xx, under its step's name. */
export function record(response, name) {
  if (response.status === 429) rateLimited.add(1, { name });
  else if (response.status >= 500) serverErrors.add(1, { name });
  return response;
}

/**
 * The scenario: a staircase of arrival rates, RATE then twice, four times and eight times it,
 * each step reached over RAMP and held for HOLD. With SMOKE=1, one iteration on one VU instead.
 *
 * `secondsPerIteration` is a guess at how long one iteration takes, for sizing the VU pool: at
 * the top step k6 needs about 8 × RATE × that many VUs. Too few shows as dropped_iterations.
 */
export function staircase({ secondsPerIteration, p95, extraThresholds = {} }) {
  const thresholds = {
    http_req_failed: [`rate<${setting("FAIL_RATE", "0.01")}`],
    http_req_duration: [`p(95)<${numberSetting("P95_MS", p95)}`],
    checks: ["rate>0.99"],
    ...extraThresholds,
  };

  if (setting("SMOKE", "0") === "1") {
    return {
      scenarios: { smoke: { executor: "per-vu-iterations", vus: 1, iterations: 1 } },
      thresholds,
    };
  }

  const rate = numberSetting("RATE", 5);
  const hold = setting("HOLD", "2m");
  const ramp = setting("RAMP", "30s");
  const stages = [];
  for (const multiple of [1, 2, 4, 8]) {
    stages.push({ target: rate * multiple, duration: ramp });
    stages.push({ target: rate * multiple, duration: hold });
  }
  const peakVUs = Math.ceil(rate * 8 * secondsPerIteration);

  return {
    scenarios: {
      staircase: {
        executor: "ramping-arrival-rate",
        startRate: rate,
        timeUnit: "1s",
        stages,
        preAllocatedVUs: numberSetting("PRE_VUS", Math.max(10, Math.ceil(peakVUs / 4))),
        maxVUs: numberSetting("MAX_VUS", Math.max(20, peakVUs * 2)),
      },
    },
    thresholds,
  };
}

/**
 * With SPOOF_IP=1, a client address for this iteration, from 198.18.0.0/15 (RFC 2544's
 * benchmarking range, never a real client), as X-Forwarded-For. The server counts rate limits
 * per address, so spreading them is the only way past the limits without changing its code.
 * It only works when the header reaches the app as one value (see the README).
 */
export function clientHeaders() {
  if (setting("SPOOF_IP", "0") !== "1") return {};
  const octet = () => Math.floor(Math.random() * 256);
  const address = `198.${18 + Math.floor(Math.random() * 2)}.${octet()}.${1 + Math.floor(Math.random() * 254)}`;
  return { "x-forwarded-for": address };
}

/** CAPTCHA_TOKEN as Better Auth's captcha plugin reads it, when Turnstile is on. */
export function captchaHeaders() {
  const token = setting("CAPTCHA_TOKEN", undefined);
  return token ? { "x-captcha-response": token } : {};
}

/** A random seeded user: user1@loadtest.example to user<USERS>@loadtest.example. */
export function seededUser() {
  const users = numberSetting("USERS", 10000);
  const index = 1 + Math.floor(Math.random() * users);
  return { email: `user${index}@loadtest.example`, password: required("PASSWORD") };
}

/** application/x-www-form-urlencoded, from an object; undefined values left out. */
export function form(fields) {
  return Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

/** A query string's values (k6 has no URLSearchParams). Later values win. */
export function queryOf(url) {
  const start = url.indexOf("?");
  const params = {};
  if (start === -1) return params;
  const end = url.indexOf("#", start);
  const query = url.slice(start + 1, end === -1 ? undefined : end);
  for (const part of query.split("&")) {
    if (!part) continue;
    const at = part.indexOf("=");
    const key = decodeURIComponent((at === -1 ? part : part.slice(0, at)).replace(/\+/g, " "));
    const value = at === -1 ? "" : decodeURIComponent(part.slice(at + 1).replace(/\+/g, " "));
    params[key] = value;
  }
  return params;
}

/** A Location header as an absolute URL: the server sends some as paths. */
export function absolute(location) {
  return location.startsWith("/") ? `${ISSUER}${location}` : location;
}

/** HTTP Basic credentials, each part form-encoded first (RFC 6749, 2.3.1). */
export function basicAuth(id, secret) {
  return `Basic ${encoding.b64encode(`${encodeURIComponent(id)}:${encodeURIComponent(secret)}`)}`;
}

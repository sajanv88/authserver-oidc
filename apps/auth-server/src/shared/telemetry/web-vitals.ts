import "server-only";
import * as v from "valibot";
import { telemetryInstruments } from "./instruments";
import { MAX_VITALS_PER_POST, WEB_VITAL_RATINGS, WEB_VITALS } from "./web-vital";

// Web vitals from browsers, posted by WebVitalsReporter and recorded as OTel histograms. The
// endpoint is public by nature (anyone can post numbers), so it accepts little: posts from this
// origin only, a small body, known names and ratings, bounded values, and routes reduced to
// the app's own pages, so nothing a client sends becomes a new attribute value.

/** Every page of the app: a reported path counts as one of these, or as "other". */
export const KNOWN_ROUTES = [
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/magic-link",
  "/two-factor",
  "/verify-email",
  "/consent",
  "/account/security",
  "/account/security/two-factor",
  "/account/security/sessions",
  "/admin/clients",
  "/admin/users",
  "/admin/users/[id]",
] as const;

/** The pages with a dynamic segment, and the paths that are one of them. */
const DYNAMIC_ROUTES: { route: (typeof KNOWN_ROUTES)[number]; path: RegExp }[] = [
  { route: "/admin/users/[id]", path: /^\/admin\/users\/[0-9a-f-]{36}$/ },
];

const NAVIGATION_TYPES = [
  "navigate",
  "reload",
  "prerender",
  "back-forward",
  "back-forward-cache",
  "restore",
  "soft-navigation",
] as const;

const MAX_BODY_BYTES = 4096;

const VitalSchema = v.object({
  name: v.picklist(WEB_VITALS),
  // Ten minutes in milliseconds is beyond any real measurement; CLS stays far below it.
  value: v.pipe(v.number(), v.finite(), v.minValue(0), v.maxValue(600_000)),
  rating: v.picklist(WEB_VITAL_RATINGS),
  navigationType: v.pipe(v.string(), v.maxLength(40)),
  route: v.pipe(v.string(), v.maxLength(2048)),
});

const PostSchema = v.pipe(v.array(VitalSchema), v.minLength(1), v.maxLength(MAX_VITALS_PER_POST));

/** The app route a reported path belongs to, or "other". */
export function routeOf(path: string): string {
  const trimmed = path.length > 1 ? path.replace(/\/+$/, "") : path;
  const dynamic = DYNAMIC_ROUTES.find((entry) => entry.path.test(trimmed));
  if (dynamic) return dynamic.route;
  return (KNOWN_ROUTES as readonly string[]).includes(trimmed) && !trimmed.includes("[")
    ? trimmed
    : "other";
}

function navigationTypeOf(value: string): string {
  return (NAVIGATION_TYPES as readonly string[]).includes(value) ? value : "other";
}

/**
 * The body as text, or undefined once it passes `maxBytes`: reading stops there, so a big or
 * endless body is never buffered.
 */
async function readAtMost(
  stream: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<string | undefined> {
  if (!stream) return "";
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/**
 * Handles one post to /api/vitals: 204 when recorded, 403 from another origin, 413 when too
 * big, 400 when it isn't a list of vitals. `ownOrigin` is the auth server's public origin.
 */
export async function receiveWebVitals(request: Request, ownOrigin: string): Promise<Response> {
  if (request.headers.get("origin") !== new URL(ownOrigin).origin) {
    return new Response(null, { status: 403 });
  }
  const declared = request.headers.get("content-length");
  if (declared !== null && !(/^\d+$/.test(declared) && Number(declared) <= MAX_BODY_BYTES)) {
    return new Response(null, { status: 413 });
  }
  // The header can be missing (chunked) or wrong, so the cap holds while reading too.
  const body = await readAtMost(request.body, MAX_BODY_BYTES);
  if (body === undefined) return new Response(null, { status: 413 });

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return new Response(null, { status: 400 });
  }
  const parsed = v.safeParse(PostSchema, json);
  if (!parsed.success) return new Response(null, { status: 400 });

  const { vitals } = telemetryInstruments();
  for (const vital of parsed.output) {
    vitals[vital.name].record(vital.value, {
      "http.route": routeOf(vital.route),
      "browser.web_vital.rating": vital.rating,
      "browser.web_vital.navigation_type": navigationTypeOf(vital.navigationType),
    });
  }
  return new Response(null, { status: 204 });
}

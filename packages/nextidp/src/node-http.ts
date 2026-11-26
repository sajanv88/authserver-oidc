// Node's own request and response, to and from the Web Request and Response the core speaks.
// Express's req and res extend Node's, so the Express adapter goes through here too.
import type { IncomingMessage, ServerResponse } from "node:http";

/** nextidp's routes take small forms only: a bigger body is refused before it's read whole. */
export const MAX_FORM_BYTES = 64 * 1024;

/** The body was bigger than MAX_FORM_BYTES: answered 413. */
export class BodyTooLarge extends Error {
  constructor() {
    super("The request body is too large.");
    this.name = "BodyTooLarge";
  }
}

/** The path and query asked for: Express's `originalUrl` when it's mounted under a path. */
export function pathOf(req: IncomingMessage): string {
  const original = (req as { originalUrl?: unknown }).originalUrl;
  const path = typeof original === "string" ? original : (req.url ?? "/");
  return path.startsWith("/") ? path : `/${path}`;
}

/**
 * The URL asked for, on this app's own origin. The Host header never decides it (anyone can
 * send one), and a path like `//elsewhere` stays a path.
 */
export function urlOf(req: IncomingMessage, appUrl: string): URL {
  return new URL(`${appUrl}${pathOf(req)}`);
}

function headersOf(req: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    // HTTP/2's pseudo-headers (:path, …) aren't headers.
    if (value === undefined || name.startsWith(":")) continue;
    if (Array.isArray(value)) for (const item of value) headers.append(name, item);
    else headers.set(name, value);
  }
  return headers;
}

/** A body a parser before us already read (`express.urlencoded()`, …), as a form again. */
function parsedBody(body: unknown): string | Uint8Array<ArrayBuffer> | undefined {
  if (typeof body === "string") return body;
  if (body instanceof Uint8Array) return new Uint8Array(body);
  if (!body || typeof body !== "object") return undefined;
  const form = new URLSearchParams();
  for (const [name, value] of Object.entries(body)) {
    if (typeof value === "string") form.append(name, value);
    else if (Array.isArray(value)) {
      for (const item of value) if (typeof item === "string") form.append(name, item);
    }
  }
  return form.toString();
}

async function readBody(req: IncomingMessage): Promise<Uint8Array<ArrayBuffer>> {
  const declared = Number(req.headers["content-length"]);
  if (declared > MAX_FORM_BYTES) throw new BodyTooLarge();
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer);
    size += bytes.length;
    if (size > MAX_FORM_BYTES) throw new BodyTooLarge();
    chunks.push(bytes);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

/** The Web Request for a Node request, its body read (or taken from a parser that read it). */
export async function toWebRequest(req: IncomingMessage, appUrl: string): Promise<Request> {
  const url = urlOf(req, appUrl);
  const headers = headersOf(req);
  const method = (req.method ?? "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") return new Request(url, { method, headers });

  let body: string | Uint8Array<ArrayBuffer> | undefined;
  if (req.readableEnded) {
    // Someone read the stream already: what they parsed is all there is.
    body = parsedBody((req as { body?: unknown }).body);
    if (typeof body === "string") headers.set("content-type", "application/x-www-form-urlencoded");
  } else {
    body = await readBody(req);
  }
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  return new Request(url, { method, headers, ...(body === undefined ? {} : { body }) });
}

/** Adds Set-Cookie headers to those the response already has. */
export function appendSetCookies(res: ServerResponse, cookies: readonly string[]): void {
  if (cookies.length === 0) return;
  const existing = res.getHeader("set-cookie");
  const list =
    existing === undefined ? [] : Array.isArray(existing) ? existing : [String(existing)];
  res.setHeader("set-cookie", [...list, ...cookies]);
}

/** Writes a Web Response to Node's response, and ends it. */
export async function sendWebResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, name) => {
    if (name !== "set-cookie") res.setHeader(name, value);
  });
  appendSetCookies(res, response.headers.getSetCookie());
  res.end(response.body ? Buffer.from(await response.arrayBuffer()) : undefined);
}

/** A plain-text answer. */
export function sendText(res: ServerResponse, status: number, text: string): void {
  res.statusCode = status;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(text);
}

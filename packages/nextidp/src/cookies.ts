// The Cookie header in, Set-Cookie headers out, with no framework in between. A value too big
// for one cookie (browsers keep about 4 KB each) is split across `<name>.0`, `<name>.1`, …

/** A sealed session is base64url with dots: under this, one cookie; over it, several. */
export const CHUNK_SIZE = 3800;
const MAX_CHUNKS = 10;

export type CookieJar = ReadonlyMap<string, string>;

/** The cookies a request carries. When a name comes twice, the first is kept. */
export function parseCookies(header: string | null | undefined): CookieJar {
  const jar = new Map<string, string>();
  for (const pair of (header ?? "").split(";")) {
    const index = pair.indexOf("=");
    if (index <= 0) continue;
    const name = pair.slice(0, index).trim();
    if (!name || jar.has(name)) continue;
    let value = pair.slice(index + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    jar.set(name, value);
  }
  return jar;
}

export type CookieAttributes = { secure: boolean; maxAge: number };

function serialize(name: string, value: string, { secure, maxAge }: CookieAttributes): string {
  return [
    `${name}=${value}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

function chunkNames(jar: CookieJar, name: string): string[] {
  return [...jar.keys()].filter(
    (key) => key.startsWith(`${name}.`) && /^\d+$/.test(key.slice(name.length + 1)),
  );
}

/** A value written by `writeCookie`: the one cookie, or its chunks joined in order. */
export function readCookie(jar: CookieJar, name: string): string | undefined {
  const whole = jar.get(name);
  if (whole) return whole;
  const parts: string[] = [];
  for (let index = 0; index < MAX_CHUNKS; index += 1) {
    const part = jar.get(`${name}.${index}`);
    if (part === undefined) break;
    parts.push(part);
  }
  return parts.length > 0 ? parts.join("") : undefined;
}

/**
 * Set-Cookie headers that store `value` under `name`, split if it's too big, and expire
 * whatever the request still holds under that name that the new value doesn't overwrite.
 */
export function writeCookie(
  jar: CookieJar,
  name: string,
  value: string,
  attributes: CookieAttributes,
): string[] {
  const headers: string[] = [];
  const written = new Set<string>();
  if (value.length <= CHUNK_SIZE) {
    headers.push(serialize(name, value, attributes));
    written.add(name);
  } else {
    const count = Math.ceil(value.length / CHUNK_SIZE);
    if (count > MAX_CHUNKS) throw new Error("The session is too big to keep in cookies.");
    for (let index = 0; index < count; index += 1) {
      const chunk = `${name}.${index}`;
      headers.push(
        serialize(chunk, value.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE), attributes),
      );
      written.add(chunk);
    }
  }
  for (const stale of [name, ...chunkNames(jar, name)]) {
    if (!written.has(stale) && jar.has(stale))
      headers.push(serialize(stale, "", { ...attributes, maxAge: 0 }));
  }
  return headers;
}

/** Set-Cookie headers that expire `name` and every chunk of it the request holds. */
export function clearCookie(jar: CookieJar, name: string, secure: boolean): string[] {
  const names = new Set([name, ...chunkNames(jar, name)]);
  return [...names].map((stale) => serialize(stale, "", { secure, maxAge: 0 }));
}

/**
 * The Cookie header the rest of this request should see once `setCookies` apply: what a
 * proxy hands on, so the page renders with the refreshed session and not the old one.
 */
export function applySetCookies(
  header: string | null | undefined,
  setCookies: readonly string[],
): string {
  const jar = new Map(parseCookies(header));
  for (const line of setCookies) {
    const [pair = ""] = line.split(";");
    const index = pair.indexOf("=");
    if (index <= 0) continue;
    const name = pair.slice(0, index);
    const value = pair.slice(index + 1);
    if (/;\s*Max-Age=0(?:;|$)/i.test(line)) jar.delete(name);
    else jar.set(name, value);
  }
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

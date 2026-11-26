// Where a session is kept: in its encrypted cookie (the default), or in a store the app
// provides, with only a sealed reference in the cookie. A store is what lets the auth server
// end a session from its side (back-channel logout): it leaves a mark for the ended
// auth-server session (`sid`) or person (`sub`), and every read of a session checks it.
import { type CookieJar, clearCookie, readCookie, writeCookie } from "./cookies.js";
import { randomToken } from "./pkce.js";
import type { Sealer } from "./sealed.js";
import { parseStoredSession, SESSION_PURPOSE, type StoredSession } from "./session.js";

/**
 * Somewhere to keep sessions: Redis, a database table, or `memoryStore()` for one process.
 * Values are strings nextidp has already encrypted. `set` must expire the key after
 * `ttlSeconds`; `get` answers undefined (or null) for a key that's missing or expired.
 *
 * ```ts
 * const store: SessionStore = {
 *   get: (key) => redis.get(key),
 *   set: async (key, value, ttlSeconds) => { await redis.set(key, value, "EX", ttlSeconds); },
 *   delete: async (key) => { await redis.del(key); },
 * };
 * ```
 */
export type SessionStore = {
  get(key: string): Promise<string | null | undefined>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
};

/**
 * A store in this process's memory: for development, tests and single-instance apps. Every
 * session is lost on a restart, and instances don't share it.
 */
export function memoryStore(): SessionStore {
  const values = new Map<string, { value: string; until: number }>();
  const sweep = (now: number) => {
    for (const [key, entry] of values) if (entry.until <= now) values.delete(key);
  };
  return {
    async get(key) {
      const entry = values.get(key);
      if (!entry) return undefined;
      if (entry.until > Date.now()) return entry.value;
      values.delete(key);
      return undefined;
    },
    async set(key, value, ttlSeconds) {
      const now = Date.now();
      if (values.size >= 10_000) sweep(now);
      values.set(key, { value, until: now + ttlSeconds * 1000 });
    },
    async delete(key) {
      values.delete(key);
    },
  };
}

/** A session as read: the store's id and when it began, when it lives in a store. */
export type Loaded = { stored: StoredSession; id?: string; createdAt?: number };

/** What ends sessions from the auth server's side: its session, or every one of a person. */
export type IdpLogout = { sid?: string | undefined; sub?: string | undefined };

export type SessionBackend = {
  load(jar: CookieJar): Promise<Loaded | undefined>;
  /** A new session, after a sign-in: in a store, any session the cookie named is removed. */
  create(jar: CookieJar, stored: StoredSession): Promise<string[]>;
  /** The same session with new tokens, after a refresh. */
  update(jar: CookieJar, loaded: Loaded, stored: StoredSession): Promise<string[]>;
  remove(jar: CookieJar): Promise<string[]>;
  /** Back-channel logout; only with a store. */
  endIdpSession?: (logout: IdpLogout) => Promise<void>;
};

type Settings = {
  sealer: Sealer;
  cookie: string;
  secure: boolean;
  maxAge: number;
  clientId: string;
};

/** The session in its cookie, as before any store. */
export function cookieBackend(settings: Settings): SessionBackend {
  const { sealer, cookie, secure, maxAge } = settings;
  const write = async (jar: CookieJar, stored: StoredSession) =>
    writeCookie(jar, cookie, await sealer.seal(stored, SESSION_PURPOSE, maxAge), {
      secure,
      maxAge,
    });
  return {
    async load(jar) {
      const stored = parseStoredSession(
        await sealer.unseal(readCookie(jar, cookie), SESSION_PURPOSE),
      );
      return stored ? { stored } : undefined;
    },
    create: write,
    update: (jar, _loaded, stored) => write(jar, stored),
    async remove(jar) {
      return clearCookie(jar, cookie, secure);
    },
  };
}

/** The cookie names a session in the store; it's sealed, so it can't be guessed or changed. */
const REFERENCE_PURPOSE = "nextidp:session-reference";
/** The stored session, sealed too: a copy of the store holds no readable tokens. */
const RECORD_PURPOSE = "nextidp:stored-session";

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function storeBackend(store: SessionStore, settings: Settings): SessionBackend {
  const { sealer, cookie, secure, maxAge } = settings;
  // Per client: apps sharing one store never see or end each other's sessions.
  const prefix = `nextidp:${encodeURIComponent(settings.clientId)}`;
  const sessionKey = (id: string) => `${prefix}:session:${id}`;
  const sidKey = (sid: string) => `${prefix}:ended-sid:${encodeURIComponent(sid)}`;
  const subKey = (sub: string) => `${prefix}:ended-sub:${encodeURIComponent(sub)}`;

  const referenced = async (jar: CookieJar) => {
    const reference = await sealer.unseal(readCookie(jar, cookie), REFERENCE_PURPOSE);
    return typeof reference?.id === "string" ? reference.id : undefined;
  };

  const save = async (jar: CookieJar, id: string, stored: StoredSession, createdAt: number) => {
    await store.set(
      sessionKey(id),
      await sealer.seal({ ...stored, createdAt }, RECORD_PURPOSE, maxAge),
      maxAge,
    );
    return writeCookie(jar, cookie, await sealer.seal({ id }, REFERENCE_PURPOSE, maxAge), {
      secure,
      maxAge,
    });
  };

  /** Ended by the auth server: its session (`sid`), or all of the person's (`sub`) since. */
  const ended = async (stored: StoredSession, createdAt: number) => {
    const { sid, sub } = stored.claims;
    if (typeof sid === "string" && sid && (await store.get(sidKey(sid)))) return true;
    if (typeof sub !== "string" || !sub) return false;
    const since = Number(await store.get(subKey(sub)));
    return Number.isFinite(since) && since >= createdAt;
  };

  return {
    async load(jar) {
      const id = await referenced(jar);
      if (!id) return undefined;
      const sealed = await store.get(sessionKey(id));
      if (!sealed) return undefined;
      const payload = await sealer.unseal(sealed, RECORD_PURPOSE);
      const stored = parseStoredSession(payload);
      const createdAt = typeof payload?.createdAt === "number" ? payload.createdAt : 0;
      if (!stored) return undefined;
      if (await ended(stored, createdAt)) {
        await store.delete(sessionKey(id));
        return undefined;
      }
      return { stored, id, createdAt };
    },

    async create(jar, stored) {
      const previous = await referenced(jar);
      if (previous) await store.delete(sessionKey(previous));
      return save(jar, randomToken(), stored, nowSeconds());
    },

    update(jar, loaded, stored) {
      return save(jar, loaded.id ?? randomToken(), stored, loaded.createdAt ?? nowSeconds());
    },

    async remove(jar) {
      const id = await referenced(jar);
      if (id) await store.delete(sessionKey(id));
      return clearCookie(jar, cookie, secure);
    },

    async endIdpSession({ sid, sub }) {
      // A `sid` names one session at the auth server: only the app's sessions from it end.
      // Only without one does `sub` end every session of the person (OIDC Back-Channel
      // Logout 1.0, 2.4). The marks outlive any session they could end.
      if (sid) await store.set(sidKey(sid), "1", maxAge);
      else if (sub) await store.set(subKey(sub), String(nowSeconds()), maxAge);
    },
  };
}

import type { SessionSummary } from "@repo/db";

// A rough name for the device behind a User-Agent, for people recognising sessions: their own
// on My profile, someone else's on an admin's user page. Not for decisions: a User-Agent is
// whatever the client says.

export type DeviceKind = "phone" | "tablet" | "computer" | "unknown";

/** A row of a session list: never the token. */
export type SessionRow = {
  id: string;
  device: { kind: DeviceKind; label: string };
  ipAddress: string | null;
  /** ISO 8601. */
  signedInAt: string;
  /** ISO 8601: Better Auth moves it when it extends the session. */
  lastActiveAt: string;
  /** The session the page was opened with. */
  current: boolean;
};

const BROWSERS: [RegExp, string][] = [
  [/Edg(?:e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
  [/curl\//, "curl"],
];

const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPod/, "iPhone"],
  [/iPad/, "iPad"],
  [/Android/, "Android"],
  [/Windows/, "Windows"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/CrOS/, "ChromeOS"],
  [/Linux/, "Linux"],
];

function first(table: [RegExp, string][], userAgent: string): string | undefined {
  return table.find(([pattern]) => pattern.test(userAgent))?.[1];
}

export function describeDevice(userAgent: string | null | undefined): {
  kind: DeviceKind;
  label: string;
} {
  const ua = userAgent ?? "";
  const browser = first(BROWSERS, ua);
  const system = first(SYSTEMS, ua);
  const kind: DeviceKind = /iPad|Tablet/.test(ua)
    ? "tablet"
    : /Mobi|iPhone|Android/.test(ua)
      ? "phone"
      : system
        ? "computer"
        : "unknown";
  const label =
    browser && system ? `${browser} on ${system}` : (browser ?? system ?? "Unknown device");
  return { kind, label };
}

/** A session as a list shows it. `currentId` marks the one the page was opened with, if any. */
export function toSessionRow(session: SessionSummary, currentId?: string): SessionRow {
  return {
    id: session.id,
    device: describeDevice(session.userAgent),
    ipAddress: session.ipAddress,
    signedInAt: session.createdAt.toISOString(),
    lastActiveAt: session.updatedAt.toISOString(),
    current: session.id === currentId,
  };
}

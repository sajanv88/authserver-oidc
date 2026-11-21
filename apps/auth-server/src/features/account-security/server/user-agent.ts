import type { DeviceKind } from "../types";

// A rough name for the device behind a User-Agent, for people recognising their own sessions.
// Not for decisions: a User-Agent is whatever the client says.

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

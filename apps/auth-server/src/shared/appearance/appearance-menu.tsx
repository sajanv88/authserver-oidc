"use client";

import { PaletteIcon } from "@nuvui/icons";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@nuvui/react";
import { useState } from "react";
import {
  APPEARANCE_COOKIE,
  type Appearance,
  MODES,
  PRESETS,
  parseAppearance,
  serializeAppearance,
} from "./appearance";

const YEAR = 60 * 60 * 24 * 365;

function currentAppearance(): Appearance {
  const html = document.documentElement;
  return parseAppearance(`${html.dataset.theme ?? ""}.${html.dataset.preset ?? "default"}`);
}

// Applied at once on <html>, and remembered in a cookie the browser writes itself: a server
// action would re-render the page and lose what's typed in its forms. Not a secret, and the
// server validates it when it reads it.
function apply(appearance: Appearance): void {
  const html = document.documentElement;
  html.dataset.theme = appearance.mode;
  if (appearance.preset === "default") delete html.dataset.preset;
  else html.dataset.preset = appearance.preset;
  const value = serializeAppearance(appearance);
  // Typed as always there; older browsers don't have it.
  if (window.cookieStore as CookieStore | undefined) {
    void window.cookieStore.set({
      name: APPEARANCE_COOKIE,
      value,
      path: "/",
      expires: Date.now() + YEAR * 1000,
      sameSite: "lax",
    });
    return;
  }
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  // biome-ignore lint/suspicious/noDocumentCookie: browsers without the Cookie Store API.
  document.cookie = `${APPEARANCE_COOKIE}=${value}; Path=/; Max-Age=${YEAR}; SameSite=Lax${secure}`;
}

/** Light or dark, and the theme: from the navigation bar and the auth pages. */
export function AppearanceMenu() {
  const [appearance, setAppearance] = useState<Appearance | null>(null);

  function choose(next: Partial<Appearance>) {
    const chosen = { ...(appearance ?? currentAppearance()), ...next };
    apply(chosen);
    setAppearance(chosen);
  }

  return (
    <DropdownMenu onOpenChange={(open) => open && setAppearance(currentAppearance())}>
      <DropdownMenuTrigger asChild>
        <Button intent="ghost" size="sm" aria-label="Appearance">
          <PaletteIcon size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={appearance?.mode ?? ""}
          onValueChange={(mode) => choose({ mode: mode as Appearance["mode"] })}
        >
          <DropdownMenuLabel>Mode</DropdownMenuLabel>
          {MODES.map((mode) => (
            <DropdownMenuRadioItem key={mode.value} value={mode.value}>
              {mode.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={appearance?.preset ?? ""}
          onValueChange={(preset) => choose({ preset: preset as Appearance["preset"] })}
        >
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          {PRESETS.map((preset) => (
            <DropdownMenuRadioItem key={preset.value} value={preset.value}>
              {preset.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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
import { type Appearance, isMode, isPreset, MODES, PRESETS, STORAGE_KEY } from "./appearance";

function currentAppearance(): Appearance {
  const { theme, preset } = document.documentElement.dataset;
  return { mode: isMode(theme) ? theme : "system", preset: isPreset(preset) ? preset : "default" };
}

function apply(appearance: Appearance): void {
  const html = document.documentElement;
  html.dataset.theme = appearance.mode;
  if (appearance.preset === "default") delete html.dataset.preset;
  else html.dataset.preset = appearance.preset;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance));
  } catch {
    // Storage can be off (a private window, blocked site data): the choice lasts this visit.
  }
}

/** Light or dark, and nuvui's presets. The previews on the page follow it too. */
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
          onValueChange={(mode) => isMode(mode) && choose({ mode })}
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
          onValueChange={(preset) => isPreset(preset) && choose({ preset })}
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

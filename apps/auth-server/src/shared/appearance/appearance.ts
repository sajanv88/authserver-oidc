import * as v from "valibot";

// Light or dark (data-theme) and one of nuvui's presets (data-preset), chosen in the
// Appearance menu and kept in a cookie, so the server renders <html> with them already set.

export const MODES = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

export const PRESETS = [
  { value: "default", label: "Default" },
  { value: "ink", label: "Ink" },
  { value: "ledger", label: "Ledger" },
  { value: "meadow", label: "Meadow" },
  { value: "ember", label: "Ember" },
  { value: "high-contrast", label: "High contrast" },
] as const;

export type Mode = (typeof MODES)[number]["value"];
export type Preset = (typeof PRESETS)[number]["value"];
export type Appearance = { mode: Mode; preset: Preset };

export const DEFAULT_APPEARANCE: Appearance = { mode: "system", preset: "default" };

export const APPEARANCE_COOKIE = "appearance";

const AppearanceSchema = v.object({
  mode: v.picklist(MODES.map((mode) => mode.value)),
  preset: v.picklist(PRESETS.map((preset) => preset.value)),
});

/** The cookie's value ("dark.ink"), or the default for anything else: it's browser input. */
export function parseAppearance(value: string | undefined): Appearance {
  const [mode, preset] = (value ?? "").split(".");
  const parsed = v.safeParse(AppearanceSchema, { mode, preset });
  return parsed.success ? parsed.output : DEFAULT_APPEARANCE;
}

export function serializeAppearance({ mode, preset }: Appearance): string {
  return `${mode}.${preset}`;
}

/** The attributes on <html>. The default preset is no attribute at all. */
export function htmlAttributes({ mode, preset }: Appearance) {
  return { "data-theme": mode, ...(preset === "default" ? {} : { "data-preset": preset }) };
}

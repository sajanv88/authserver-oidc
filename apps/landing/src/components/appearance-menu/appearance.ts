// Light or dark (data-theme) and one of nuvui's presets (data-preset) on <html>, the same
// choice the auth server offers. The page is static, so it's kept in localStorage.

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

export const STORAGE_KEY = "appearance";

const modes: readonly string[] = MODES.map((mode) => mode.value);
const presets: readonly string[] = PRESETS.map((preset) => preset.value);

export function isMode(value: unknown): value is Mode {
  return typeof value === "string" && modes.includes(value);
}

export function isPreset(value: unknown): value is Preset {
  return typeof value === "string" && presets.includes(value);
}

/**
 * Runs in <head> before the page paints, so a stored choice never flashes the default first.
 * Plain ES5 in a string: it runs before any bundle has loaded.
 */
export const APPLY_STORED_APPEARANCE = `try{var a=JSON.parse(localStorage.getItem(${JSON.stringify(
  STORAGE_KEY,
)})||"{}"),h=document.documentElement;if(${JSON.stringify(modes)}.indexOf(a.mode)>-1)h.dataset.theme=a.mode;if(a.preset!=="default"&&${JSON.stringify(
  presets,
)}.indexOf(a.preset)>-1)h.dataset.preset=a.preset}catch(e){}`;

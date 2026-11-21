import "server-only";
import { parseEnv, type ServerEnv } from "./env-schema";

export type { EmailConfig, ServerEnv } from "./env-schema";

let parsed: ServerEnv | undefined;

/**
 * The validated runtime configuration. Parsed on first use, not at import, so `next build`
 * never needs runtime secrets. Throws with every problem listed (names and rules only, never
 * values) when the environment is wrong.
 */
export function env(): ServerEnv {
  if (parsed) return parsed;
  const result = parseEnv(process.env);
  if (!result.ok) {
    throw new Error(`Invalid environment:\n  - ${result.errors.join("\n  - ")}`);
  }
  parsed = result.env;
  return parsed;
}

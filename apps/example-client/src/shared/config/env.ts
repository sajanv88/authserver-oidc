import "server-only";
import { type ExampleEnv, parseEnv } from "./env-schema";

let cached: ExampleEnv | undefined;

/** The validated configuration, read on first use (never at import, so builds need none). */
export function env(): ExampleEnv {
  cached ??= parseEnv(process.env);
  return cached;
}

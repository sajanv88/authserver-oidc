import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Each test file starts an in-memory Postgres (PGlite, WASM) and applies every migration.
    // About a second on a laptop, but over 10 seconds on a shared CI runner while turbo runs
    // other packages' typechecks and tests alongside, which broke vitest's default 10s limit.
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});

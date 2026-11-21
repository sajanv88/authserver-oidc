import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@/": fileURLToPath(new URL("./src/", import.meta.url)),
      // `server-only` throws outside a React server context, which is what keeps server code
      // out of client bundles. Tests run that server code directly, so it's a no-op here.
      "server-only": fileURLToPath(new URL("./test/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    // The auth tests start an in-memory Postgres (PGlite, WASM) per file, migrate it, and drive
    // Better Auth over it: about a second locally, over 10 seconds on a busy shared CI runner
    // (vitest's default limit).
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});

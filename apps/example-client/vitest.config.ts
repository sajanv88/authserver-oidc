import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      // `@/…` is src/ (tsconfig paths). A regex: a string key "@/" would only match "@//…",
      // so the alias never applied, and on Windows nothing else resolved `@/` either.
      { find: /^@\//, replacement: fileURLToPath(new URL("./src/", import.meta.url)) },
      // `server-only` throws outside a React server context, which is what keeps server code
      // out of client bundles. Tests run that server code directly, so it's a no-op here.
      {
        find: /^server-only$/,
        replacement: fileURLToPath(new URL("./test/server-only.ts", import.meta.url)),
      },
    ],
  },
  test: {
    include: ["src/**/*.test.ts"],
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});

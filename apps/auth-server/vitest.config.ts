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
    include: ["src/**/*.test.ts"],
  },
});

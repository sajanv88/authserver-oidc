import { existsSync } from "node:fs";
import type { NextConfig } from "next";

// Local development reads the repo root .env, like the auth server. Variables already in the
// environment win.
if (process.env.NODE_ENV === "development" && existsSync("../../.env")) {
  process.loadEnvFile("../../.env");
}

// Static security headers. The Content-Security-Policy carries a nonce, so src/proxy.ts sets it.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: true,
  typedRoutes: true,
  poweredByHeader: false,
  agentRules: false,
  // app.localtest.me in development; without it the dev server blocks /_next/hmr, and with it
  // the RSC debug channel React waits on before hydrating. See the auth server's config.
  allowedDevOrigins: ["*.localtest.me"],
  sassOptions: {
    loadPaths: ["src/shared/styles"],
  },
  experimental: {
    useTypeScriptCli: true,
    optimizePackageImports: ["@nuvui/icons"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

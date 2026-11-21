import { existsSync } from "node:fs";
import type { NextConfig } from "next";

// Local development reads the repo root .env (Next only reads .env files beside the app). Never
// at build or in production: the image has no .env, and its config comes from the chart.
// Variables already in the environment always win.
if (process.env.NODE_ENV === "development" && existsSync("../../.env")) {
  process.loadEnvFile("../../.env");
}

// Static security headers. The Content-Security-Policy changes per request (it carries a
// nonce), so src/proxy.ts sets it.
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

const deploymentId = process.env.NEXT_DEPLOYMENT_ID;

const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  typedRoutes: true,
  poweredByHeader: false,
  // Agent instructions live in the repo's CLAUDE.md; don't let `next dev` write an AGENTS.md.
  agentRules: false,
  // Skew protection across a rolling update: the Dockerfile passes the commit SHA.
  ...(deploymentId ? { deploymentId } : {}),
  sassOptions: {
    loadPaths: ["src/shared/styles"],
  },
  experimental: {
    // Type-check with the project's own tsc: TypeScript 7, the native compiler.
    useTypeScriptCli: true,
    // Prune @nuvui/icons to the icons a page imports, in development too.
    optimizePackageImports: ["@nuvui/icons"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

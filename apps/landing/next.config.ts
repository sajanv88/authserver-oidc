import type { NextConfig } from "next";

// A static export, served by GitHub Pages from a project path (/authserver-oidc). The Pages
// workflow passes that path as PAGES_BASE_PATH; locally the site is at the root.
const basePath = process.env.PAGES_BASE_PATH;

const nextConfig: NextConfig = {
  output: "export",
  ...(basePath ? { basePath } : {}),
  // GitHub Pages serves /about/ from about/index.html, not /about from about.html.
  trailingSlash: true,
  images: { unoptimized: true },
  typedRoutes: true,
  poweredByHeader: false,
  agentRules: false,
  sassOptions: {
    loadPaths: ["src/styles"],
  },
  experimental: {
    useTypeScriptCli: true,
    optimizePackageImports: ["@nuvui/icons"],
  },
};

export default nextConfig;

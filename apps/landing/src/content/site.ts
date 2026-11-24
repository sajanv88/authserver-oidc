// Facts about the project the page repeats in several places.

export const PRODUCT_NAME = "Auth Server";

/** The link preview's picture, drawn by src/app/og.png/route.tsx. */
export const OG_IMAGE = {
  path: "/og.png",
  width: 1200,
  height: 630,
  alt: `${PRODUCT_NAME}: the identity server you run yourself. Self-hosted OpenID Connect and OAuth 2.0 on Next.js and Better Auth.`,
};

export const REPO_URL = "https://github.com/sajanv88/authserver-oidc";

export const repo = (path: string) => `${REPO_URL}/${path}`;

/** Who to contact about the project. */
export const AUTHOR = {
  github: "https://github.com/sajanv88",
  website: "https://sajankumarv.com",
};

/** The sections the navigation bar and the footer link to, by their ids on the page. */
export const SECTIONS = [
  { id: "why", name: "Why" },
  { id: "features", name: "Features" },
  { id: "how-it-works", name: "How it works" },
  { id: "quick-start", name: "Quick start" },
  { id: "connect", name: "Connect an app" },
  { id: "deploy", name: "Deploy" },
  { id: "faq", name: "FAQ" },
] as const;

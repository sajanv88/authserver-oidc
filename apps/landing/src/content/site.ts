// Facts about the project the page repeats in several places.

export const PRODUCT_NAME = "Next-Identity Server";

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

/** The step-by-step guide, at /docs. */
export const DOCS_PATH = "/docs";

/** Where the navigation bar's main button leads: the first steps, on the home page. */
export const GET_STARTED_SECTION = "quick-start";

/**
 * The navigation bar's entries that open a panel: sections of the home page, by their ids,
 * each with a line that says what's there.
 */
export const NAV_GROUPS = [
  {
    name: "Product",
    sections: [
      { id: "why", name: "Why", about: "What you get by running your own identity server." },
      { id: "features", name: "Features", about: "Sign-in, two-factor, consent and the admin." },
      { id: "how-it-works", name: "How it works", about: "An app's sign-in, step by step." },
      { id: "security", name: "Security", about: "What's on by default, and what's yours to set." },
    ],
  },
  {
    name: "Get started",
    sections: [
      { id: "quick-start", name: "Quick start", about: "The server on your machine in minutes." },
      { id: "connect", name: "Connect an app", about: "Sign people in to your app with nextidp." },
      { id: "deploy", name: "Deploy", about: "The Docker image and the Helm chart." },
    ],
  },
] as const;

/** The navigation bar's plain links, after the panels. */
export const NAV_LINKS = [
  { href: DOCS_PATH, name: "Docs", page: "docs" },
  { href: "/#faq", name: "FAQ", page: undefined },
] as const;

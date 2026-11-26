import type { TableOfContentsItem } from "@nuvui/react";
import type { Metadata } from "next";
import { Article } from "@/components/docs/article/article";
import { C } from "@/components/docs/content/content";
import { ConfidentialSecrets, Pkce, RegisterApp } from "@/components/docs/guide/apps";
import { Kubernetes, ProductionImage } from "@/components/docs/guide/deploy";
import { Email } from "@/components/docs/guide/email";
import { BeforeYouStart, FirstAdmin, RunLocally } from "@/components/docs/guide/getting-started";
import { Nextidp } from "@/components/docs/guide/nextidp";
import { Resources, Scopes } from "@/components/docs/guide/scopes-resources";
import { Security } from "@/components/docs/guide/security";
import { SocialSignIn } from "@/components/docs/guide/social";
import { SiteFooter } from "@/components/site-footer/site-footer";
import { SiteHeader } from "@/components/site-header/site-header";
import { SkipLink } from "@/components/skip-link/skip-link";
import { PRODUCT_NAME } from "@/content/site";

export const metadata: Metadata = {
  title: `Guide · ${PRODUCT_NAME}`,
  description:
    "Run the auth server with Docker Compose, seed an admin, add Google, Microsoft or GitHub sign-in, define scopes and APIs, register apps with PKCE and secrets, sign people in to Next.js apps with nextidp, send email over SMTP, and deploy to Kubernetes.",
};

// In page order: every id is a heading's id in the guide.
const contents: TableOfContentsItem[] = [
  { id: "before-you-start", title: "Before you start" },
  { id: "run-locally", title: "Run it with Docker Compose" },
  { id: "admin", title: "The first admin" },
  { id: "admin-seed", title: "The seed", depth: 2 },
  { id: "admin-production", title: "In production", depth: 2 },
  { id: "social", title: "Social sign-in" },
  { id: "social-accounts", title: "How accounts are matched", depth: 2 },
  { id: "scopes", title: "Scopes" },
  { id: "resources", title: "Your APIs (resources)" },
  { id: "resources-without", title: "Without a resource", depth: 2 },
  { id: "register-app", title: "Register an app" },
  { id: "nextidp", title: "Apps and APIs: nextidp" },
  { id: "nextidp-routes", title: "Its routes", depth: 2 },
  { id: "nextidp-api", title: "Protecting your API", depth: 2 },
  { id: "pkce", title: "PKCE, step by step" },
  { id: "par", title: "Pushed requests (PAR)", depth: 2 },
  { id: "sign-out", title: "Signing out here too", depth: 2 },
  { id: "secrets", title: "Confidential secrets" },
  { id: "security", title: "Security" },
  { id: "security-defaults", title: "On by default", depth: 2 },
  { id: "security-yours", title: "Yours to set", depth: 2 },
  { id: "security-users", title: "What your users get", depth: 2 },
  { id: "security-admins", title: "Managing people", depth: 2 },
  { id: "email", title: "Email over SMTP" },
  { id: "email-tls", title: "Encrypted, always", depth: 2 },
  { id: "image", title: "The production image" },
  { id: "kubernetes", title: "Deploy to Kubernetes" },
  { id: "kubernetes-migrations", title: "Migrations and Argo CD", depth: 2 },
];

export default function DocsPage() {
  return (
    // One element at the root, not a fragment: on a navigation Next scrolls the new page's
    // root into view, and with the bar, the page and the footer side by side it scrolled to
    // each in turn, ending at the footer. One box is scrolled to its top.
    <div>
      <SkipLink />
      <SiteHeader current="docs" />
      <main id="content">
        <Article
          kicker="Guide"
          title={`Setting up ${PRODUCT_NAME}`}
          lead={
            <>
              From <C>docker compose up</C> on your machine to a Helm release in your cluster, one
              step at a time, with screenshots of the server at each one.
            </>
          }
          contents={contents}
        >
          <BeforeYouStart />
          <RunLocally />
          <FirstAdmin />
          <SocialSignIn />
          <Scopes />
          <Resources />
          <RegisterApp />
          <Nextidp />
          <Pkce />
          <ConfidentialSecrets />
          <Security />
          <Email />
          <ProductionImage />
          <Kubernetes />
        </Article>
      </main>
      <SiteFooter />
    </div>
  );
}

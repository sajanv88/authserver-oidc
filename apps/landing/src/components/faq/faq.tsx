import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@nuvui/react";
import { repo } from "@/content/site";
import "./faq.scss";

const QUESTIONS = [
  {
    id: "licence",
    question: "Is it free for commercial use?",
    answer:
      "Yes. It's MIT licensed: run it in production, for as many users and apps as you have, with no licence key and nothing to pay.",
  },
  {
    id: "hosted",
    question: "Is this a hosted service?",
    answer:
      "No. You run it, on your own domain and your own database, and your users' accounts never leave it. It's MIT licensed.",
  },
  {
    id: "flows",
    question: "Which OAuth and OIDC flows does it support?",
    answer:
      "The authorization code flow with PKCE (S256) for apps that sign people in, refresh tokens that rotate, and client credentials for services that call your APIs. An app can push its authorization request from its server first (PAR, RFC 9126): it's authenticated and checked before the user sees anything, and the browser carries only a one-time request_uri. No implicit flow and no device flow: they're the ones that go wrong.",
  },
  {
    id: "clients",
    question: "How do I add an app?",
    answer:
      "Sign in as an admin, open /admin/clients and add it with its redirect URI. A confidential client gets a secret, shown once; a public one, such as a single-page app, uses PKCE alone. For many apps, declare them in a JSON file and run pnpm clients:provision.",
  },
  {
    id: "apis",
    question: "Can my own APIs check its tokens?",
    answer:
      "Yes. List them in OAUTH_RESOURCES and an app that names one as resource gets a JWT whose audience is that API. Your API checks it against /jwks, with no call to this server. Only apps linked to an API get tokens for it.",
  },
  {
    id: "cookie",
    question: "Can my apps skip OIDC?",
    answer:
      "Apps on the same parent domain can read the shared session cookie instead. Do that only for apps you fully trust: every subdomain receives that cookie.",
  },
  {
    id: "email",
    question: "What sends the emails?",
    answer:
      "Any SMTP server in production, such as Cloudflare's. The emails are React Email templates with your name and logo, in HTML and plain text. Locally, every email is printed in the terminal, links included.",
  },
  {
    id: "turnstile",
    question: "Do I need Cloudflare Turnstile?",
    answer:
      "No. It's on when both of its keys are set and off when neither is. With it on, the forms need JavaScript; without it, they work with JavaScript off.",
  },
  {
    id: "look",
    question: "Can I change how it looks?",
    answer:
      "Set APP_NAME and LOGO_URL and every page, email and authenticator entry carries your name and logo. Users pick light or dark and one of six themes, and every screen is built on nuvui's tokens, so a color you change, changes everywhere.",
  },
  {
    id: "upgrades",
    question: "How do upgrades work?",
    answer:
      "Each release is a version tag with its own image and Helm chart. Upgrading is a new chart version: the database migrations run as a job before the new pods start, and a migration is never edited once it's released.",
  },
  {
    id: "help",
    question: "Where do I get help?",
    answer:
      "Open an issue on GitHub for a bug or a question. The README and CLAUDE.md in the repository describe how each part works and how to deploy it.",
  },
];

export function Faq() {
  return (
    <section className="section" id="faq" aria-labelledby="faq-title">
      <div className="section__inner faq">
        <div className="section__intro">
          <p className="section__eyebrow">FAQ</p>
          <h2 className="section__title" id="faq-title">
            Questions people ask
          </h2>
          <p className="section__lead">
            Something else?{" "}
            <a className="faq__link" href={repo("issues")}>
              Open an issue
            </a>{" "}
            and ask.
          </p>
        </div>
        <Accordion type="single" collapsible className="faq__list">
          {QUESTIONS.map((item) => (
            <AccordionItem key={item.id} value={item.id}>
              <AccordionTrigger>{item.question}</AccordionTrigger>
              <AccordionContent>{item.answer}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

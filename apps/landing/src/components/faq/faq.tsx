import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@nuvui/react";
import { repo } from "@/content/site";
import "./faq.scss";

const QUESTIONS = [
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
      "The authorization code flow with PKCE (S256), and refresh tokens that rotate. No implicit flow, no client credentials and no device flow: they're the ones that go wrong.",
  },
  {
    id: "clients",
    question: "How do I add an app?",
    answer:
      "Sign in as an admin, open /admin/clients and add it with its redirect URI. A confidential client gets a secret, shown once; a public one, such as a single-page app, uses PKCE alone.",
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
      "Any SMTP server in production, such as Cloudflare's. Locally, every email is printed in the terminal, links included.",
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
      "Users pick light or dark and one of six themes. The product's name is one constant, and every screen is built on nuvui's tokens, so a color you change, changes everywhere.",
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

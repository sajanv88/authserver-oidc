import { ArrowRightIcon, KeyIcon, ShieldCheckIcon, UsersIcon } from "@nuvui/icons";
import { Button, Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@nuvui/react";
import "./pillars.scss";

const PILLARS = [
  {
    Icon: KeyIcon,
    title: "Sign-in that's yours",
    text: "Your domain, your name and logo, your database. Passwords, magic links, two-factor and the providers you choose, on pages your users recognise.",
    more: { href: "#features", label: "What's included" },
  },
  {
    Icon: ShieldCheckIcon,
    title: "Secure before you configure",
    text: "PKCE on every sign-in, rotating refresh tokens, hashed secrets, rate limits and a strict CSP from the first start, with tests that hold them in place.",
    more: { href: "#security", label: "How it's protected" },
  },
  {
    Icon: UsersIcon,
    title: "Every app, one identity",
    text: "Web apps and single-page apps sign people in with OIDC, services get client credentials, and your APIs get JWTs meant for them alone.",
    more: { href: "#connect", label: "Connect an app" },
  },
];

/** Under the hero: what the server is for, in three parts, each with the section that shows it. */
export function Pillars() {
  return (
    <section className="section" id="overview" aria-labelledby="overview-title">
      <div className="section__inner">
        <div className="section__intro">
          <p className="section__eyebrow">Identity you control</p>
          <h2 className="section__title" id="overview-title">
            Your users, your apps and your keys stay on infrastructure you run
          </h2>
          <p className="section__lead">
            An identity provider you can read, change and deploy like the rest of your stack, with
            the standards your apps already speak.
          </p>
        </div>
        <ul className="pillars">
          {PILLARS.map(({ Icon, title, text, more }) => (
            <li key={title}>
              <Card className="pillars__card">
                <CardHeader className="pillars__body">
                  <span className="pillars__icon">
                    <Icon size={20} />
                  </span>
                  <CardTitle asChild>
                    <h3>{title}</h3>
                  </CardTitle>
                  <CardDescription>{text}</CardDescription>
                </CardHeader>
                <CardFooter>
                  <Button asChild intent="ghost" size="sm">
                    <a href={more.href}>
                      {more.label}
                      <ArrowRightIcon size={16} />
                    </a>
                  </Button>
                </CardFooter>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

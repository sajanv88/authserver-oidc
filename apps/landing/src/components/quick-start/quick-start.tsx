import { Code } from "../code/code";
import "./quick-start.scss";

const STEPS = [
  {
    title: "Clone and install",
    text: "Node.js 26 and pnpm. One install for the whole monorepo.",
    language: "sh",
    code: `git clone https://github.com/sajanv88/authserver-oidc.git
cd authserver-oidc
pnpm install`,
  },
  {
    title: "Configure",
    text: "Copy the example and fill in the secrets. The app checks every setting when it starts, and says which one is wrong.",
    language: "sh",
    code: `cp .env.example .env
# Then set, in .env:
#   DATABASE_URL            a Postgres 17 database
#   BETTER_AUTH_SECRET      openssl rand -base64 32
#   SEED_ADMIN_PASSWORD     12 characters or more
#   EXAMPLE_SESSION_SECRET  openssl rand -base64 32`,
  },
  {
    title: "Create the database",
    text: "Tables from the committed migrations, then an admin and the example app as a client. Put the client ID it prints in EXAMPLE_CLIENT_ID.",
    language: "sh",
    code: `docker compose up -d   # or use your own Postgres
pnpm db:migrate
pnpm db:seed`,
  },
  {
    title: "Run it",
    text: "Emails are printed in the terminal instead of sent. *.localtest.me always points at your own machine.",
    language: "sh",
    code: `pnpm dev
# auth server   http://auth.localtest.me:3000
# example app   http://app.localtest.me:3001`,
  },
];

export function QuickStart() {
  return (
    <section
      className="section section--muted"
      id="quick-start"
      aria-labelledby="quick-start-title"
    >
      <div className="section__inner quick-start">
        <div className="section__intro">
          <p className="section__eyebrow">Quick start</p>
          <h2 className="section__title" id="quick-start-title">
            Running on your machine in five minutes
          </h2>
          <p className="section__lead">
            Four steps, each with the commands to copy. The example app signs in through the server
            both ways: the shared cookie and the full OIDC flow.
          </p>
        </div>
        <ol className="quick-start__steps">
          {STEPS.map((step, index) => (
            <li key={step.title} className="quick-start__step">
              <span className="quick-start__number">{index + 1}</span>
              <div className="quick-start__body">
                <h3 className="quick-start__title">{step.title}</h3>
                <p className="quick-start__text">{step.text}</p>
                <Code
                  code={step.code}
                  language={step.language}
                  title="Terminal"
                  label={`Commands to ${step.title.toLowerCase()}`}
                  typing
                  typingTrigger="view"
                  typingDelay={index * 150}
                />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

import { Badge } from "@nuvui/react";
import "./stack.scss";

const GROUPS = [
  { name: "App", items: ["Next.js 16", "React 19", "Better Auth 1.7", "TypeScript 7", "valibot"] },
  { name: "Data", items: ["PostgreSQL 17", "Drizzle ORM", "PGlite in tests"] },
  { name: "UI", items: ["nuvui", "SCSS with BEM", "Cloudflare Turnstile"] },
  { name: "Ship", items: ["pnpm and Turborepo", "Docker", "Helm", "Argo CD", "OpenTelemetry"] },
  { name: "Test", items: ["Vitest", "Playwright with BDD scenarios", "Biome", "stylelint"] },
];

export function Stack() {
  return (
    <section className="section section--muted" id="stack" aria-labelledby="stack-title">
      <div className="section__inner">
        <div className="section__intro">
          <p className="section__eyebrow">Built with</p>
          <h2 className="section__title" id="stack-title">
            A codebase you'd want to work in
          </h2>
          <p className="section__lead">
            Small features with clear boundaries, enforced by the linter. Every change runs lint,
            types, unit tests, a build, a Docker health check and Helm checks before it merges.
          </p>
        </div>
        <dl className="stack">
          {GROUPS.map((group) => (
            <div key={group.name} className="stack__group">
              <dt className="stack__name">{group.name}</dt>
              <dd className="stack__items">
                {group.items.map((item) => (
                  <Badge key={item} variant="outline">
                    {item}
                  </Badge>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

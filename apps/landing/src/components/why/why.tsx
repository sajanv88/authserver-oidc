import { CodeIcon, RocketIcon, ScaleIcon, UnlockIcon } from "@nuvui/icons";
import { PRODUCT_NAME } from "@/content/site";
import "./why.scss";

const REASONS = [
  {
    Icon: UnlockIcon,
    title: "No lock-in, no licence keys",
    text: "MIT licensed and free in production, with no per-user pricing. It runs on your Postgres, behind your ingress, and your users' accounts never leave it.",
  },
  {
    Icon: ScaleIcon,
    title: "Standards first",
    text: "OpenID Connect discovery, the authorization code flow with PKCE, RFC 8707 resource tokens and back-channel logout. Any standard OIDC client library connects without custom code.",
  },
  {
    Icon: CodeIcon,
    title: "Built to change",
    text: "A Next.js app on Better Auth, in small features with boundaries the linter enforces. Add a sign-in step, a provider or a claim the same way the existing ones were written.",
  },
  {
    Icon: RocketIcon,
    title: "A short way to production",
    text: "A few commands run it locally next to an example app. A multi-arch image with provenance and an SBOM, a Helm chart, migrations as a pre-sync job, and traces and metrics over OpenTelemetry take it the rest of the way.",
  },
];

/** Why run this server: the four things it's built around. */
export function Why() {
  return (
    <section className="section section--muted" id="why" aria-labelledby="why-title">
      <div className="section__inner">
        <div className="section__intro">
          <p className="section__eyebrow">Why {PRODUCT_NAME}</p>
          <h2 className="section__title" id="why-title">
            The control of building it yourself, without building it yourself
          </h2>
        </div>
        <ul className="why">
          {REASONS.map(({ Icon, title, text }) => (
            <li key={title} className="why__item">
              <span className="why__icon">
                <Icon size={20} />
              </span>
              <h3 className="why__title">{title}</h3>
              <p className="why__text">{text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

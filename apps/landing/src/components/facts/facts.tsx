import "./facts.scss";

const FACTS = [
  { value: "RS256", label: "Signed ID tokens, keys at /jwks" },
  { value: "S256", label: "PKCE, required for every sign-in" },
  { value: "10 min", label: "Access and ID tokens" },
  { value: "30 days", label: "Refresh tokens, rotated on each use" },
];

/** The numbers a developer checks first, under the hero. */
export function Facts() {
  return (
    <section className="facts" aria-label="At a glance">
      <dl className="facts__list">
        {FACTS.map((fact) => (
          <div key={fact.value} className="facts__item">
            <dt className="facts__label">{fact.label}</dt>
            <dd className="facts__value">{fact.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

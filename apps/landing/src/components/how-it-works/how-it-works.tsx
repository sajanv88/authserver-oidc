import "./how-it-works.scss";

const STEPS = [
  {
    title: "Your app sends them here",
    text: "A redirect to /authorize with a PKCE challenge, a state and a nonce. The app was registered once, by an admin.",
    call: "GET /api/auth/oauth2/authorize",
  },
  {
    title: "They sign in",
    text: "A password or a magic link, then a code from their authenticator app if two-factor is on. Already signed in? Skipped.",
    call: "/login · /two-factor",
  },
  {
    title: "They allow the app",
    text: "The consent screen lists what the app asked for, in words. Allow and they're sent back with a one-time code.",
    call: "/consent",
  },
  {
    title: "Your app swaps the code",
    text: "A POST with the code and the PKCE verifier returns an RS256 ID token, an access token and a refresh token.",
    call: "POST /api/auth/oauth2/token",
  },
  {
    title: "Verify, and you're in",
    text: "Check the ID token against the public keys, and its nonce. Ask /userinfo for the profile when you need it.",
    call: "GET /jwks · GET …/userinfo",
  },
];

export function HowItWorks() {
  return (
    <section className="section" id="how-it-works" aria-labelledby="how-it-works-title">
      <div className="section__inner">
        <div className="section__intro">
          <p className="section__eyebrow">How it works</p>
          <h2 className="section__title" id="how-it-works-title">
            Standard OpenID Connect, start to finish
          </h2>
          <p className="section__lead">
            The authorization code flow with PKCE, and nothing else. No implicit flow, no client
            credentials, no tokens in a URL. Any OIDC client library speaks it.
          </p>
        </div>
        <ol className="how-it-works">
          {STEPS.map((step, index) => (
            <li key={step.title} className="how-it-works__step">
              <span className="how-it-works__number">{index + 1}</span>
              <div className="how-it-works__body">
                <h3 className="how-it-works__title">{step.title}</h3>
                <p className="how-it-works__text">{step.text}</p>
                <code className="how-it-works__call">{step.call}</code>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

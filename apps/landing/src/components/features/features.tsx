import {
  BotIcon,
  GaugeIcon,
  KeyIcon,
  LayoutDashboardIcon,
  LinkIcon,
  PaletteIcon,
  PlugIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
} from "@nuvui/icons";
import { Card, CardDescription, CardHeader, CardTitle } from "@nuvui/react";
import "./features.scss";

const FEATURES = [
  {
    Icon: KeyIcon,
    title: "Sign-in, done properly",
    text: "Email and password, magic links and resets, plus Google, Microsoft, GitHub or your own OIDC provider when you set their keys.",
  },
  {
    Icon: SmartphoneIcon,
    title: "Two-factor",
    text: "Authenticator apps with backup codes. Turning it on or off, and new codes, each ask for the password first.",
  },
  {
    Icon: ShieldCheckIcon,
    title: "Account security",
    text: "Change the password, see every device that's signed in, and sign out one of them or all of them.",
  },
  {
    Icon: PlugIcon,
    title: "OpenID Connect",
    text: "Authorization code with PKCE, rotating refresh tokens, discovery, a consent screen and token revocation.",
  },
  {
    Icon: LayoutDashboardIcon,
    title: "An admin for your apps",
    text: "Register clients, public or confidential, and rotate their secrets. Secrets are stored hashed and shown once.",
  },
  {
    Icon: LinkIcon,
    title: "Shared session",
    text: "One sign-in across your subdomains, through a session cookie on the parent domain, for the apps you trust.",
  },
  {
    Icon: BotIcon,
    title: "Bot protection",
    text: "Cloudflare Turnstile on every form and on the endpoints behind them. On when its two keys are set, off otherwise.",
  },
  {
    Icon: GaugeIcon,
    title: "Rate limits",
    text: "Per client IP on sign-in, sign-up, codes, tokens and every email, behind a proxy you name.",
  },
  {
    Icon: PaletteIcon,
    title: "Themes",
    text: "Light, dark or the system's, six color themes from nuvui, and moving gradients on the sign-in pages.",
  },
];

export function Features() {
  return (
    <section className="section" id="features" aria-labelledby="features-title">
      <div className="section__inner">
        <div className="section__intro">
          <p className="section__eyebrow">Features</p>
          <h2 className="section__title" id="features-title">
            Everything between “Sign in” and a verified ID token
          </h2>
          <p className="section__lead">
            What an app needs from an identity provider, with nothing to write before the first user
            signs in.
          </p>
        </div>
        <ul className="features">
          {FEATURES.map(({ Icon, title, text }) => (
            <li key={title}>
              <Card className="features__card">
                <CardHeader>
                  <span className="features__icon">
                    <Icon size={20} />
                  </span>
                  <CardTitle asChild>
                    <h3>{title}</h3>
                  </CardTitle>
                  <CardDescription>{text}</CardDescription>
                </CardHeader>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

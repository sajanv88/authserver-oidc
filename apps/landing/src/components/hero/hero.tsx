"use client";

import { GlyphBackground } from "@nuvui/backgrounds/glyph-background";
import { ArrowRightIcon, CheckIcon, RepositoryIcon } from "@nuvui/icons";
import { Badge, Button, TextReveal } from "@nuvui/react";
import { useState } from "react";
import { REPO_URL } from "@/content/site";
import { Code } from "../code/code";
import { PauseButton } from "../pause-button/pause-button";
import "./hero.scss";

const DISCOVERY = `{
  "issuer": "https://auth.example.com",
  "authorization_endpoint": "https://auth.example.com/api/auth/oauth2/authorize",
  "token_endpoint": "https://auth.example.com/api/auth/oauth2/token",
  "userinfo_endpoint": "https://auth.example.com/api/auth/oauth2/userinfo",
  "jwks_uri": "https://auth.example.com/jwks",
  "scopes_supported": ["openid", "profile", "email", "offline_access"],
  "grant_types_supported": ["authorization_code", "client_credentials", "refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "backchannel_logout_supported": true
}`;

const HIGHLIGHTS = ["OpenID Connect and OAuth 2.0", "Self-hosted", "Free in production"];

export function Hero() {
  const [paused, setPaused] = useState(false);

  return (
    <section className="hero" aria-labelledby="hero-title" id="top">
      <GlyphBackground
        className="hero__stage"
        scrim="soft"
        paused={paused}
        glyphs="{}[]<>/=;:.#*+-01"
      >
        <div className="hero__inner">
          <div className="hero__words">
            <Badge intent="primary" variant="outline">
              Open source · MIT
            </Badge>
            <h1 className="hero__title" id="hero-title">
              <TextReveal lines={["The identity server", "you run yourself"]} />
            </h1>
            <p className="hero__lead">
              OpenID Connect and OAuth 2.0 for your apps and APIs, on your domain and your database.
              Accounts, two-factor, consent and an admin for your apps, shipped as one Docker image
              with a Helm chart.
            </p>
            <div className="hero__actions">
              <Button asChild size="lg">
                <a href="#quick-start">
                  Get started
                  <ArrowRightIcon size={16} />
                </a>
              </Button>
              <Button asChild size="lg" intent="secondary">
                <a href={REPO_URL}>
                  <RepositoryIcon size={16} />
                  View on GitHub
                </a>
              </Button>
            </div>
            <ul className="hero__highlights">
              {HIGHLIGHTS.map((item) => (
                <li key={item} className="hero__highlight">
                  <CheckIcon size={16} className="hero__check" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <figure className="hero__code">
            <Code
              code={DISCOVERY}
              language="json"
              title="GET /.well-known/openid-configuration"
              label="The discovery document"
              typing
              typingDuration={2600}
              typingDelay={400}
            />
            <figcaption className="hero__caption">
              Point any OIDC library at the issuer. It reads the rest from here.
            </figcaption>
          </figure>
        </div>
        <PauseButton
          className="hero__pause"
          paused={paused}
          onToggle={() => setPaused((now) => !now)}
        />
      </GlyphBackground>
    </section>
  );
}

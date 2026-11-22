"use client";

import { GradientBackground } from "@nuvui/backgrounds/gradient-background";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@nuvui/react";
import { type ReactNode, useState } from "react";
import { PauseButton } from "../pause-button/pause-button";
import { ConsentScreen, SignInScreen, TwoFactorScreen } from "./preview-screens";
import "./preview.scss";

const SCREENS: { value: string; name: string; caption: string; screen: ReactNode }[] = [
  {
    value: "sign-in",
    name: "Sign in",
    caption:
      "A password, or a link to a magic link and to sign-up. An app's request travels along, signed, so the user lands back in the app.",
    screen: <SignInScreen />,
  },
  {
    value: "two-factor",
    name: "Two-factor",
    caption:
      "The second step, when the account has an authenticator app: a six-digit code, or one of the backup codes.",
    screen: <TwoFactorScreen />,
  },
  {
    value: "consent",
    name: "Consent",
    caption:
      "What the app asks for, in words. Only what the signed request vouches for is shown, and it's checked again on Allow.",
    screen: <ConsentScreen />,
  },
];

export function Preview() {
  const [paused, setPaused] = useState(false);

  return (
    <section className="section section--muted" id="preview" aria-labelledby="preview-title">
      <div className="section__inner">
        <div className="section__intro">
          <p className="section__eyebrow">Preview</p>
          <h2 className="section__title" id="preview-title">
            The screens your users see
          </h2>
          <p className="section__lead">
            Built from nuvui components, in the theme you pick. Try the palette at the top of the
            page: these follow it, as the real pages do.
          </p>
        </div>
        <Tabs defaultValue="sign-in" className="preview">
          <TabsList aria-label="Screens">
            {SCREENS.map((screen) => (
              <TabsTrigger key={screen.value} value={screen.value}>
                {screen.name}
              </TabsTrigger>
            ))}
          </TabsList>
          {SCREENS.map((screen) => (
            <TabsContent key={screen.value} value={screen.value}>
              <figure className="preview__figure">
                <GradientBackground className="preview__frame" scrim="soft" paused={paused}>
                  <div className="preview__picture" inert>
                    {screen.screen}
                  </div>
                  <PauseButton
                    className="preview__pause"
                    paused={paused}
                    onToggle={() => setPaused((now) => !now)}
                  />
                </GradientBackground>
                <figcaption className="preview__caption">
                  <strong>{screen.name}.</strong> {screen.caption}
                </figcaption>
              </figure>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </section>
  );
}

"use client";

import { GradientBackground } from "@nuvui/backgrounds/gradient-background";
import { ArrowRightIcon, RepositoryIcon } from "@nuvui/icons";
import { Button } from "@nuvui/react";
import { useState } from "react";
import { REPO_URL } from "@/content/site";
import { PauseButton } from "../pause-button/pause-button";
import "./call-to-action.scss";

export function CallToAction() {
  const [paused, setPaused] = useState(false);

  return (
    <section className="call-to-action" aria-labelledby="call-to-action-title">
      <GradientBackground className="call-to-action__panel" scrim="soft" paused={paused}>
        <h2 className="call-to-action__title" id="call-to-action-title">
          Own your sign-in
        </h2>
        <p className="call-to-action__text">
          Clone it, run it on your machine, and sign in to the example app through it. Then connect
          your own.
        </p>
        <div className="call-to-action__actions">
          <Button asChild size="lg">
            <a href="#quick-start">
              Start the quick start
              <ArrowRightIcon size={16} />
            </a>
          </Button>
          <Button asChild size="lg" intent="secondary">
            <a href={REPO_URL}>
              <RepositoryIcon size={16} />
              Star it on GitHub
            </a>
          </Button>
        </div>
        <PauseButton
          className="call-to-action__pause"
          paused={paused}
          onToggle={() => setPaused((now) => !now)}
        />
      </GradientBackground>
    </section>
  );
}

"use client";

import { GradientBackground } from "@nuvui/backgrounds/gradient-background";
import { PauseIcon, PlayIcon } from "@nuvui/icons";
import { Button } from "@nuvui/react";
import { type ReactNode, useState } from "react";
import { AppearanceMenu } from "@/shared/appearance/appearance-menu";

/**
 * The auth pages' moving gradient, in the theme's colors. Anything that moves for more than
 * five seconds needs a way to stop it (WCAG 2.2.2), hence the pause button.
 */
export function AuthBackdrop({ children }: { children: ReactNode }) {
  const [paused, setPaused] = useState(false);

  return (
    <GradientBackground className="auth-card__backdrop" scrim="soft" paused={paused}>
      <div className="auth-card__toolbar">
        <Button
          intent="ghost"
          size="sm"
          aria-label="Pause the background"
          aria-pressed={paused}
          onClick={() => setPaused((now) => !now)}
        >
          {paused ? <PlayIcon size={16} /> : <PauseIcon size={16} />}
        </Button>
        <AppearanceMenu />
      </div>
      {children}
    </GradientBackground>
  );
}

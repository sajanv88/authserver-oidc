"use client";

import { PauseIcon, PlayIcon } from "@nuvui/icons";
import { Button } from "@nuvui/react";

type PauseButtonProps = {
  paused: boolean;
  onToggle: () => void;
  className?: string;
};

/** Anything that moves for more than five seconds needs a way to stop it (WCAG 2.2.2). */
export function PauseButton({ paused, onToggle, className }: PauseButtonProps) {
  return (
    <Button intent="ghost" size="sm" className={className} aria-pressed={paused} onClick={onToggle}>
      {paused ? <PlayIcon size={16} /> : <PauseIcon size={16} />}
      Pause the background
    </Button>
  );
}

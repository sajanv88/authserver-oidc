import type { ReactNode } from "react";
import "./steps.scss";

/** Numbered steps: an ordered list, so a screen reader says how many and which one. */
export function Steps({ children }: { children: ReactNode }) {
  return <ol className="steps">{children}</ol>;
}

/** One step: what to do, then how. */
export function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li className="steps__step">
      <h4 className="steps__title">{title}</h4>
      <div className="steps__body">{children}</div>
    </li>
  );
}

import { VisuallyHidden } from "@nuvui/react";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./text-link.scss";

type TextLinkProps = {
  href: Route;
  children: ReactNode;
};

/**
 * A link inside a line of text: underlined, because color alone doesn't tell it from the words
 * around it, with nuvui's focus ring. Only to routes of this app (typed by `typedRoutes`).
 */
export function TextLink({ href, children }: TextLinkProps) {
  return (
    <Link className="text-link" href={href}>
      {children}
    </Link>
  );
}

/**
 * A link to another site inside a line of text, drawn like a TextLink. It opens in a new tab,
 * so whatever was typed on this page is still there, and says so to a screen reader.
 */
export function ExternalTextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="text-link" href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <VisuallyHidden> (opens in a new tab)</VisuallyHidden>
    </a>
  );
}

type TextButtonProps = {
  onClick: () => void;
  children: ReactNode;
};

/**
 * Something done on this page, inside a line of text ("Use a different email"): a button,
 * because it doesn't navigate, drawn like a TextLink.
 */
export function TextButton({ onClick, children }: TextButtonProps) {
  return (
    <button type="button" className="text-link text-link--button" onClick={onClick}>
      {children}
    </button>
  );
}

/**
 * A form's submit button inside a line of text ("Use another account"), drawn like a TextLink.
 * A form rather than a click handler, so it works before JavaScript loads.
 */
export function TextSubmit({ children }: { children: ReactNode }) {
  return (
    <button type="submit" className="text-link text-link--button">
      {children}
    </button>
  );
}

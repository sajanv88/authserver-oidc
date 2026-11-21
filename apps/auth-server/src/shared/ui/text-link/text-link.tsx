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

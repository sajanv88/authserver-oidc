import { ShieldCheckIcon } from "@nuvui/icons";
import { Navbar, NavbarActions, NavbarBrand, NavbarMenu, NavbarNav } from "@nuvui/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { APP_NAME } from "@/shared/config/app";
import { PageShellLinks, type ShellLink } from "./page-shell-links";
import "./page-shell.scss";

export type { ShellLink } from "./page-shell-links";

type PageShellProps = {
  /** The page's h1. */
  title: string;
  description?: ReactNode;
  /** The signed-in user's places: account security, and client admin for admins. */
  links: ShellLink[];
  /** At the far end of the bar at every width, such as a sign-out button. */
  actions?: ReactNode;
  children: ReactNode;
};

/**
 * The frame of the signed-in pages: a skip link, nuvui's Navbar, and the page's main landmark
 * with its heading. A server component; only the links' `current` state runs on the client.
 */
export function PageShell({ title, description, links, actions, children }: PageShellProps) {
  return (
    <div className="page-shell">
      <a className="page-shell__skip" href="#content">
        Skip to content
      </a>
      <Navbar sticky>
        <NavbarBrand>
          <Link className="page-shell__brand" href="/">
            <ShieldCheckIcon size={20} />
            {APP_NAME}
          </Link>
        </NavbarBrand>
        <NavbarNav aria-label="Main">
          <PageShellLinks links={links} />
        </NavbarNav>
        <NavbarActions>
          {actions}
          <NavbarMenu>
            <nav aria-label="Main">
              <PageShellLinks links={links} />
            </nav>
          </NavbarMenu>
        </NavbarActions>
      </Navbar>
      <main className="page-shell__main" id="content">
        <header className="page-shell__header">
          <h1 className="page-shell__title">{title}</h1>
          {description ? <p className="page-shell__description">{description}</p> : null}
        </header>
        {children}
      </main>
    </div>
  );
}

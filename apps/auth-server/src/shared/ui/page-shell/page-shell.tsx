import { ShieldCheckIcon } from "@nuvui/icons";
import { Navbar, NavbarActions, NavbarBrand, NavbarMenu, NavbarNav } from "@nuvui/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { APP_NAME } from "@/shared/config/app";
import { PageShellLinks, type ShellLink } from "./page-shell-links";
import "./page-shell.scss";

export type { ShellLink } from "./page-shell-links";

type PageShellProps = {
  /** The signed-in user's places: account security, and client admin for admins. */
  links: ShellLink[];
  /** At the far end of the bar at every width, such as a sign-out button. */
  actions?: ReactNode;
  /** The page, starting with its PageHeader. */
  children: ReactNode;
};

/**
 * Rendered by the signed-in layout so it stays put while pages change. Each page renders its
 * own heading with PageHeader. A server component; only the links' `current` state runs on the
 * client.
 */
export function PageShell({ links, actions, children }: PageShellProps) {
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
        {children}
      </main>
    </div>
  );
}

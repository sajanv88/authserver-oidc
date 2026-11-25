import { RepositoryIcon, ShieldCheckIcon } from "@nuvui/icons";
import {
  Button,
  Navbar,
  NavbarActions,
  NavbarBrand,
  NavbarLink,
  NavbarMenu,
  NavbarNav,
  ScrollProgress,
} from "@nuvui/react";
import Link from "next/link";
import { DOCS_PATH, PRODUCT_NAME, REPO_URL, SECTIONS } from "@/content/site";
import { AppearanceMenu } from "../appearance-menu/appearance-menu";
import "./site-header.scss";

// Written once, drawn twice: in the bar on a wide screen, in the panel on a narrow one. The
// sections are on the home page, so from /docs they lead back there; next/link adds the base
// path the site is served under.
function Links({ current }: { current?: "docs" | undefined }) {
  return (
    <>
      {SECTIONS.map((section) => (
        <NavbarLink key={section.id} asChild>
          <Link href={`/#${section.id}`}>{section.name}</Link>
        </NavbarLink>
      ))}
      <NavbarLink asChild current={current === "docs"}>
        <Link href={DOCS_PATH}>Docs</Link>
      </NavbarLink>
    </>
  );
}

/** `current` marks the page that's open, when it's one of the links. */
export function SiteHeader({ current }: { current?: "docs" | undefined } = {}) {
  return (
    <>
      <ScrollProgress className="site-header__progress" />
      <Navbar sticky collapse="lg" className="site-header">
        <NavbarBrand>
          <Link className="site-header__brand" href="/">
            <ShieldCheckIcon size={22} />
            {PRODUCT_NAME}
          </Link>
        </NavbarBrand>
        <NavbarNav aria-label="Main">
          <Links current={current} />
        </NavbarNav>
        <NavbarActions>
          <AppearanceMenu />
          <Button asChild intent="secondary" size="sm" className="site-header__wide">
            <a href={REPO_URL}>
              <RepositoryIcon size={16} />
              GitHub
            </a>
          </Button>
          <NavbarMenu>
            <nav aria-label="Main">
              <Links current={current} />
            </nav>
            <Button asChild intent="secondary" className="site-header__repo">
              <a href={REPO_URL}>
                <RepositoryIcon size={16} />
                View on GitHub
              </a>
            </Button>
          </NavbarMenu>
        </NavbarActions>
      </Navbar>
    </>
  );
}

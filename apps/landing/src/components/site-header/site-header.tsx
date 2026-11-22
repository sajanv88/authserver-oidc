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
import { PRODUCT_NAME, REPO_URL, SECTIONS } from "@/content/site";
import { AppearanceMenu } from "../appearance-menu/appearance-menu";
import "./site-header.scss";

// Written once, drawn twice: in the bar on a wide screen, in the panel on a narrow one.
function Links() {
  return SECTIONS.map((section) => (
    <NavbarLink key={section.id} href={`#${section.id}`}>
      {section.name}
    </NavbarLink>
  ));
}

export function SiteHeader() {
  return (
    <>
      <ScrollProgress className="site-header__progress" />
      <Navbar sticky collapse="lg" className="site-header">
        <NavbarBrand>
          <a className="site-header__brand" href="#top">
            <ShieldCheckIcon size={22} />
            {PRODUCT_NAME}
          </a>
        </NavbarBrand>
        <NavbarNav aria-label="Main">
          <Links />
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
              <Links />
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

import { ArrowRightIcon, RepositoryIcon, ShieldCheckIcon } from "@nuvui/icons";
import {
  Button,
  Navbar,
  NavbarActions,
  NavbarBrand,
  NavbarLink,
  NavbarMenu,
  NavbarNav,
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  ScrollProgress,
} from "@nuvui/react";
import type { Route } from "next";
import Link from "next/link";
import { GET_STARTED_SECTION, NAV_GROUPS, NAV_LINKS, PRODUCT_NAME, REPO_URL } from "@/content/site";
import { AppearanceMenu } from "../appearance-menu/appearance-menu";
import "./site-header.scss";

type Current = "docs" | undefined;

// The sections are on the home page, so from /docs they lead back there. next/link adds the
// base path the site is served under.
const sectionHref = (id: string) => `/#${id}` as Route;

/** The bar's links on a wide screen: two entries that open a panel, then the plain links. */
function BarLinks({ current }: { current: Current }) {
  return (
    <NavigationMenuList>
      {NAV_GROUPS.map((group) => (
        <NavigationMenuItem key={group.name}>
          <NavigationMenuTrigger>{group.name}</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="site-header__panel">
              {group.sections.map((section) => (
                <li key={section.id}>
                  <NavigationMenuLink asChild>
                    <Link href={sectionHref(section.id)}>
                      {section.name}
                      <span className="site-header__about">{section.about}</span>
                    </Link>
                  </NavigationMenuLink>
                </li>
              ))}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
      ))}
      {NAV_LINKS.map((link) => (
        <NavigationMenuItem key={link.href}>
          <NavigationMenuLink asChild active={link.page !== undefined && link.page === current}>
            <Link href={link.href as Route}>{link.name}</Link>
          </NavigationMenuLink>
        </NavigationMenuItem>
      ))}
    </NavigationMenuList>
  );
}

/** The same links in the panel a narrow screen opens, each group under its name. */
function PanelLinks({ current }: { current: Current }) {
  return (
    <nav aria-label="Main" className="site-header__menu">
      {NAV_GROUPS.map((group) => (
        <div key={group.name} className="site-header__group">
          <p className="site-header__group-name">{group.name}</p>
          {group.sections.map((section) => (
            <NavbarLink key={section.id} asChild>
              <Link href={sectionHref(section.id)}>{section.name}</Link>
            </NavbarLink>
          ))}
        </div>
      ))}
      <div className="site-header__group">
        {NAV_LINKS.map((link) => (
          <NavbarLink
            key={link.href}
            asChild
            current={link.page !== undefined && link.page === current}
          >
            <Link href={link.href as Route}>{link.name}</Link>
          </NavbarLink>
        ))}
      </div>
    </nav>
  );
}

function GetStarted({ className }: { className: string }) {
  return (
    <Button asChild size="sm" className={className}>
      <Link href={sectionHref(GET_STARTED_SECTION)}>
        Get started
        <ArrowRightIcon size={16} />
      </Link>
    </Button>
  );
}

/**
 * The bar: the links at the start, the name in the middle, the actions at the end. They're
 * written in that order too, so Tab moves through them as they're seen. Below the lg
 * breakpoint the links are in the panel and the name moves to the start.
 *
 * `current` marks the page that's open, when it's one of the links.
 */
export function SiteHeader({ current }: { current?: Current } = {}) {
  return (
    <>
      <ScrollProgress className="site-header__progress" />
      <div className="site-header">
        <Navbar collapse="lg" className="site-header__bar">
          <NavbarNav asChild className="site-header__side">
            <NavigationMenu aria-label="Main">
              <BarLinks current={current} />
            </NavigationMenu>
          </NavbarNav>
          <NavbarBrand>
            <Link className="site-header__brand" href="/">
              <ShieldCheckIcon size={22} />
              {PRODUCT_NAME}
            </Link>
          </NavbarBrand>
          <NavbarActions className="site-header__side site-header__actions">
            <span className="site-header__wide">
              <AppearanceMenu />
            </span>
            <Button asChild intent="secondary" size="sm" className="site-header__wide">
              <a href={REPO_URL}>
                <RepositoryIcon size={16} />
                GitHub
              </a>
            </Button>
            <GetStarted className="site-header__start" />
            <NavbarMenu>
              <PanelLinks current={current} />
              <div className="site-header__panel-actions">
                <GetStarted className="site-header__panel-start" />
                <Button asChild intent="secondary" size="sm">
                  <a href={REPO_URL}>
                    <RepositoryIcon size={16} />
                    View on GitHub
                  </a>
                </Button>
                <AppearanceMenu />
              </div>
            </NavbarMenu>
          </NavbarActions>
        </Navbar>
      </div>
    </>
  );
}

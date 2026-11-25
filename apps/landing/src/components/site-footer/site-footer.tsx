import { ShieldCheckIcon } from "@nuvui/icons";
import { Separator } from "@nuvui/react";
import { AUTHOR, PRODUCT_NAME, REPO_URL, repo } from "@/content/site";
import "./site-footer.scss";
import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

const GROUPS = [
  {
    title: "Product",
    links: [
      { name: "Features", href: "#features" },
      { name: "Preview", href: "#preview" },
      { name: "How it works", href: "#how-it-works" },
      { name: "Security", href: "#security" },
    ],
  },
  {
    title: "Developers",
    links: [
      { name: "Docs", href: "/docs" },
      { name: "Quick start", href: "#quick-start" },
      { name: "Connect an app", href: "#connect" },
      { name: "Deploy", href: "#deploy" },
      { name: "Example client", href: repo("tree/main/apps/example-client") },
    ],
  },
  {
    title: "Project",
    links: [
      { name: "Source code", href: REPO_URL },
      { name: "Issues", href: repo("issues") },
      { name: "Releases", href: repo("releases") },
      { name: "End-to-end tests", href: repo("tree/main/apps/tests") },
    ],
  },
  {
    title: "Contact",
    links: [
      { name: "GitHub: @sajanv88", href: AUTHOR.github },
      { name: "sajankumarv.com", href: AUTHOR.website },
    ],
  },
];

/**
 * A page of this site (a section of the home page, or the docs) through next/link, which adds
 * the base path the site is served under; anywhere else, a plain link.
 */
function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  if (href.startsWith("#") || href.startsWith("/")) {
    const route = (href.startsWith("#") ? `/${href}` : href) as Route;
    return (
      <Link className="site-footer__link" href={route}>
        {children}
      </Link>
    );
  }
  return (
    <a className="site-footer__link" href={href}>
      {children}
    </a>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__top">
          <div className="site-footer__about">
            <Link className="site-footer__brand" href="/">
              <ShieldCheckIcon size={22} />
              {PRODUCT_NAME}
            </Link>
            <p className="site-footer__text">
              A self-hosted OpenID Connect server for the apps you build. One account, every app.
            </p>
          </div>
          {GROUPS.map((group) => {
            const id = `footer-${group.title.toLowerCase()}`;
            return (
              // Each list is a landmark of its own, named by its heading.
              <nav key={group.title} className="site-footer__group" aria-labelledby={id}>
                <h2 className="site-footer__heading" id={id}>
                  {group.title}
                </h2>
                <ul className="site-footer__list">
                  {group.links.map((link) => (
                    <li key={link.name}>
                      <FooterLink href={link.href}>{link.name}</FooterLink>
                    </li>
                  ))}
                </ul>
              </nav>
            );
          })}
        </div>
        <Separator />
        <div className="site-footer__foot">
          <p className="site-footer__note">
            MIT licensed. Built with Next.js, Better Auth and nuvui.
          </p>
          <a className="site-footer__link" href={repo("blob/main/LICENSE")}>
            License
          </a>
        </div>
      </div>
    </footer>
  );
}

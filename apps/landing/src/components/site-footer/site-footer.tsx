import { ShieldCheckIcon } from "@nuvui/icons";
import { Separator } from "@nuvui/react";
import { AUTHOR, PRODUCT_NAME, REPO_URL, repo } from "@/content/site";
import "./site-footer.scss";

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

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__top">
          <div className="site-footer__about">
            <a className="site-footer__brand" href="#top">
              <ShieldCheckIcon size={22} />
              {PRODUCT_NAME}
            </a>
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
                      <a className="site-footer__link" href={link.href}>
                        {link.name}
                      </a>
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

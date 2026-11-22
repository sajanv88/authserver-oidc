import Link from "next/link";
import { APP_NAME } from "@/shared/config/app";
import "./site-header.scss";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link href="/" className="site-header__brand">
          {APP_NAME}
        </Link>
        <nav aria-label="Pages" className="site-header__nav">
          <Link href="/" className="site-header__link">
            Home
          </Link>
          <Link href="/me" className="site-header__link">
            Tokens
          </Link>
        </nav>
      </div>
    </header>
  );
}

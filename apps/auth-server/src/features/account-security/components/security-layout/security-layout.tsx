import { KeyIcon, MonitorIcon, ShieldCheckIcon } from "@nuvui/icons";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@nuvui/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { SECURITY_PAGES, type SecurityPage } from "@/shared/auth/account-pages";
import { signInMethodsForAccount } from "../../server/sign-in-methods";
import type { AccountUser } from "../../types";
import { ProfileHeader } from "../profile-header/profile-header";
import "./security-layout.scss";

const TABS: { page: SecurityPage; label: string; Icon: typeof KeyIcon }[] = [
  { page: "password", label: "Password", Icon: KeyIcon },
  { page: "twoFactor", label: "Two-factor", Icon: ShieldCheckIcon },
  { page: "sessions", label: "Sessions", Icon: MonitorIcon },
];

/**
 * The profile pages: who's signed in, then the pages as vertical tabs beside the one that's
 * open. The tabs are links (each part is a page of its own, with its own address), so they're
 * a navigation menu with the open one marked, not a tab list.
 */
export async function SecurityLayout({
  user,
  active,
  children,
}: {
  user: AccountUser;
  active: SecurityPage;
  children: ReactNode;
}) {
  const methods = await signInMethodsForAccount(active);
  const signInWith = new Intl.ListFormat("en", { type: "conjunction" }).format([
    ...(methods.hasPassword ? ["Password"] : []),
    ...methods.providers,
  ]);
  return (
    <div className="security-layout">
      <ProfileHeader user={user} signInWith={signInWith} />
      <div className="security-layout__body">
        <NavigationMenu
          aria-label="Profile settings"
          orientation="vertical"
          className="security-layout__nav"
        >
          <NavigationMenuList className="security-layout__tabs">
            {TABS.map(({ page, label, Icon }) => (
              <NavigationMenuItem key={page}>
                <NavigationMenuLink asChild active={page === active}>
                  <Link href={SECURITY_PAGES[page]} className="security-layout__tab">
                    <Icon size={16} aria-hidden="true" />
                    {label}
                  </Link>
                </NavigationMenuLink>
              </NavigationMenuItem>
            ))}
          </NavigationMenuList>
        </NavigationMenu>
        <div className="security-layout__content">{children}</div>
      </div>
    </div>
  );
}

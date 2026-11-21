"use client";

import { NavbarLink } from "@nuvui/react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type ShellLink = { href: Route; label: string };

/**
 * The shell's links, marked `current` from the router. Rendered twice by PageShell, in the bar
 * and in the narrow-screen panel, as nuvui's Navbar expects. The client part is only this.
 */
export function PageShellLinks({ links }: { links: ShellLink[] }) {
  const pathname = usePathname();
  return links.map((link) => (
    <NavbarLink
      key={link.href}
      asChild
      current={pathname === link.href || pathname.startsWith(`${link.href}/`)}
    >
      <Link href={link.href}>{link.label}</Link>
    </NavbarLink>
  ));
}

import { headers } from "next/headers";
import type { ReactNode } from "react";
import { AppearanceMenu } from "@/shared/appearance/appearance-menu";
import { requireSession } from "@/shared/auth/session";
import { SignOutButton } from "@/shared/auth/sign-out-button";
import { PageShell, type ShellLink } from "@/shared/ui/page-shell/page-shell";

// Reads the session on the server before rendering anything, by design: protected UI never
// streams ahead of the auth check. So navigations here block (Next's guide for authentication
// with Cache Components); instant-navigation validation is off for this segment.
export const instant = false;

// The frame of every signed-in page. The session check here sends anonymous visitors to the
// login page; each page and server action still checks for itself, because a layout isn't
// re-run on every navigation.
export default async function SignedInLayout({ children }: { children: ReactNode }) {
  const returnTo = (await headers()).get("x-pathname") ?? "/";
  const session = await requireSession(returnTo);
  const links: ShellLink[] = [
    { href: "/account/security", label: "Security" },
    ...(session.user.role === "admin"
      ? [{ href: "/admin/clients", label: "OIDC clients" } satisfies ShellLink]
      : []),
  ];

  return (
    <PageShell
      links={links}
      actions={
        <>
          <AppearanceMenu />
          <SignOutButton />
        </>
      }
    >
      {children}
    </PageShell>
  );
}

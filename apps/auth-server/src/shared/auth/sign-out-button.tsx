"use client";

import { LogOutIcon } from "@nuvui/icons";
import { Button, Spinner, toast } from "@nuvui/react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { authClient } from "./auth-client";

/**
 * Ends this session, then re-renders the page: the signed-in layout finds no session and
 * sends the browser to the login page. Other devices stay signed in (account security has
 * "sign out everywhere").
 */
export function SignOutButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function signOut() {
    startTransition(async () => {
      const { error } = await authClient.signOut();
      if (error) {
        toast("Couldn't sign out", { intent: "danger", description: "Try again in a moment." });
        return;
      }
      router.refresh();
    });
  }

  return (
    <Button type="button" intent="ghost" size="sm" disabled={pending} onClick={signOut}>
      {pending ? <Spinner size="sm" label="" /> : <LogOutIcon size={16} />}
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}

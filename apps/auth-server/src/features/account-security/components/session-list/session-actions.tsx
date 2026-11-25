"use client";

import { LogOutIcon } from "@nuvui/icons";
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Spinner,
  toast,
} from "@nuvui/react";
import { type MouseEvent, useState, useTransition } from "react";
import { revokeSessionAction, signOutEverywhereAction } from "../../actions/sessions";

/**
 * Signs one other session out. No confirmation: it costs that device a sign-in, nothing more.
 * The row goes with the refresh the action asks for.
 */
export function RevokeSessionButton({
  sessionId,
  label,
  labelledBy,
}: {
  sessionId: string;
  label: string;
  labelledBy: string;
}) {
  const [pending, startTransition] = useTransition();

  function revoke() {
    startTransition(async () => {
      const result = await revokeSessionAction(sessionId);
      if (result.ok || result.problem === "not-found") {
        toast(`Signed out of ${label}`);
        return;
      }
      toast("Couldn't sign that session out", {
        intent: "danger",
        description: "Try again in a moment.",
      });
    });
  }

  return (
    <Button
      type="button"
      intent="secondary"
      size="sm"
      disabled={pending}
      onClick={revoke}
      aria-describedby={labelledBy}
    >
      {pending ? <Spinner size="sm" label="" /> : <LogOutIcon size={16} />}
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}

export function SignOutEverywhereButton() {
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState("");

  async function signOut(event: MouseEvent) {
    // Keeps the dialog open; on success the action redirects to the login page.
    event.preventDefault();
    setWorking(true);
    setProblem("");
    const result = await signOutEverywhereAction();
    setWorking(false);
    if (!result.ok) setProblem("That didn't work. Try again in a moment.");
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setProblem("");
      }}
    >
      <AlertDialogTrigger asChild>
        <Button intent="danger" size="sm">
          Sign out everywhere
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogTitle>Sign out everywhere?</AlertDialogTitle>
        <AlertDialogDescription>
          Every device signed in to your account is signed out, this one included. Access you've
          given to apps isn't changed.
        </AlertDialogDescription>
        {problem ? (
          <Alert intent="danger">
            <AlertDescription>{problem}</AlertDescription>
          </Alert>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={working}>Stay signed in</AlertDialogCancel>
          <AlertDialogAction intent="danger" disabled={working} onClick={signOut}>
            {working ? "Signing out…" : "Sign out everywhere"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

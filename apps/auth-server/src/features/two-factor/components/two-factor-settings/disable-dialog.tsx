"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  toast,
} from "@nuvui/react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { disableAction } from "../../actions/settings";
import type { DisableState } from "../../types";
import { PasswordForm } from "./password-form";

const INITIAL: DisableState = { status: "password", attempt: 0 };

function DisablePanel({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useActionState(disableAction, INITIAL);
  const reported = useRef(false);
  useEffect(() => {
    if (state.status !== "done" || reported.current) return;
    reported.current = true;
    onDone();
  }, [state.status, onDone]);
  if (state.status === "done") return null;
  return (
    <PasswordForm
      key={state.attempt}
      action={action}
      pending={pending}
      attempt={state}
      submitLabel="Turn off two-factor"
      pendingLabel="Turning off…"
      intent="danger"
    />
  );
}

/**
 * Turning two-factor off, after the password. A Dialog, not an AlertDialog: it holds a form
 * (nuvui's guidance). Its content unmounts when closed, so each opening starts afresh.
 */
export function DisableDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button intent="danger">Turn off</Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogTitle>Turn off two-factor authentication?</DialogTitle>
        <DialogDescription>
          Signing in will only need your password, and your backup codes will stop working.
        </DialogDescription>
        <DisablePanel
          onDone={() => {
            setOpen(false);
            toast("Two-factor authentication is off");
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

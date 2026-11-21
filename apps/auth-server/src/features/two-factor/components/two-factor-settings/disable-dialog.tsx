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
import { useState } from "react";
import { authClient } from "@/shared/auth/auth-client";
import { PasswordForm } from "./password-form";

/**
 * Turning two-factor off, after the password. A Dialog, not an AlertDialog: it holds a form
 * (nuvui's guidance).
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
        <PasswordForm
          submitLabel="Turn off two-factor"
          pendingLabel="Turning off…"
          intent="danger"
          onConfirm={async (password) => {
            const { error } = await authClient.twoFactor.disable({ password });
            if (error) return error;
            setOpen(false);
            toast("Two-factor authentication is off");
            router.refresh();
            return null;
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

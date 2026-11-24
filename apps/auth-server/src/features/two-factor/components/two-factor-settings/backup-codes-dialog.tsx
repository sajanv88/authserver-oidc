"use client";

import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
} from "@nuvui/react";
import { useActionState } from "react";
import { backupCodesAction } from "../../actions/settings";
import type { BackupCodesState } from "../../types";
import { BackupCodesList } from "./backup-codes-list";
import { PasswordForm } from "./password-form";

const INITIAL: BackupCodesState = { status: "password", attempt: 0 };

/** The dialog's content: mounted while it's open, so each opening starts afresh. */
function BackupCodesPanel({ appName }: { appName: string }) {
  const [state, action, pending] = useActionState(backupCodesAction, INITIAL);
  return (
    <>
      <DialogTitle>
        {state.status === "done" ? "Save your new backup codes" : "Get new backup codes"}
      </DialogTitle>
      <DialogDescription>
        {state.status === "done"
          ? "Your old backup codes no longer work. These won't be shown again."
          : "Your current backup codes will stop working. Confirm your password to continue."}
      </DialogDescription>
      {state.status === "done" ? (
        <>
          <BackupCodesList codes={state.backupCodes} appName={appName} />
          <DialogFooter>
            <DialogClose asChild>
              <Button>I've saved them</Button>
            </DialogClose>
          </DialogFooter>
        </>
      ) : (
        <PasswordForm
          key={state.attempt}
          action={action}
          pending={pending}
          attempt={state}
          submitLabel="Get new codes"
          pendingLabel="Generating…"
        />
      )}
    </>
  );
}

/** New backup codes, after the password. The old ones stop working at once. */
export function BackupCodesDialog({ appName }: { appName: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button intent="secondary">New backup codes</Button>
      </DialogTrigger>
      <DialogContent>
        <BackupCodesPanel appName={appName} />
      </DialogContent>
    </Dialog>
  );
}

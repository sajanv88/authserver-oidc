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
import { useState } from "react";
import { authClient } from "@/shared/auth/auth-client";
import { BackupCodesList } from "./backup-codes-list";
import { PasswordForm } from "./password-form";

/** New backup codes, after the password. The old ones stop working at once. */
export function BackupCodesDialog() {
  const [open, setOpen] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setCodes(null);
      }}
    >
      <DialogTrigger asChild>
        <Button intent="secondary">New backup codes</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>{codes ? "Save your new backup codes" : "Get new backup codes"}</DialogTitle>
        <DialogDescription>
          {codes
            ? "Your old backup codes no longer work. These won't be shown again."
            : "Your current backup codes will stop working. Confirm your password to continue."}
        </DialogDescription>
        {codes ? (
          <>
            <BackupCodesList codes={codes} />
            <DialogFooter>
              <DialogClose asChild>
                <Button>I've saved them</Button>
              </DialogClose>
            </DialogFooter>
          </>
        ) : (
          <PasswordForm
            submitLabel="Get new codes"
            pendingLabel="Generating…"
            onConfirm={async (password) => {
              const { data, error } = await authClient.twoFactor.generateBackupCodes({ password });
              if (error) return error;
              setCodes(data.backupCodes);
              return null;
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

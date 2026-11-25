"use client";

import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  NativeSelect,
  toast,
} from "@nuvui/react";
import Form from "next/form";
import { useActionState, useEffect, useRef, useState } from "react";
import { Turnstile } from "@/shared/ui/turnstile/turnstile";
import { disableUserAction } from "../../actions/users";
import type { DisableUserState } from "../../types";
import "./disable-dialog.scss";

const FORM_ID = "disable-user-form";

const INITIAL: DisableUserState = { attempt: 0, values: { reason: "", period: "forever" } };

/** The form, inside DialogContent: it unmounts when the dialog closes, so each opening is new. */
function DisableForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(disableUserAction, INITIAL);
  // Once per answer, though the dialog re-renders while it closes.
  const handled = useRef(0);

  useEffect(() => {
    if (!state.done || handled.current === state.attempt) return;
    handled.current = state.attempt;
    onDone();
  }, [state, onDone]);

  return (
    <>
      <DialogBody>
        {/* Keyed by attempt: a failed attempt remounts it with what was typed. */}
        <Form
          key={state.attempt}
          id={FORM_ID}
          action={formAction}
          className="disable-dialog__form"
          noValidate
        >
          <input type="hidden" name="userId" value={userId} />
          {state.formError ? (
            <Alert intent="danger">
              <AlertDescription>{state.formError}</AlertDescription>
            </Alert>
          ) : null}
          <Field required>
            <FieldLabel>For how long</FieldLabel>
            <FieldControl>
              <NativeSelect name="period" defaultValue={state.values.period}>
                <option value="forever">Until an admin enables it</option>
                <option value="1d">1 day</option>
                <option value="7d">7 days</option>
                <option value="30d">30 days</option>
              </NativeSelect>
            </FieldControl>
            <FieldError>{state.errors?.period}</FieldError>
          </Field>
          <Field>
            <FieldLabel>Reason</FieldLabel>
            <FieldControl>
              <Input name="reason" defaultValue={state.values.reason} maxLength={200} />
            </FieldControl>
            <FieldDescription>For admins only. The person isn't told it.</FieldDescription>
            <FieldError>{state.errors?.reason}</FieldError>
          </Field>
          <Turnstile />
        </Form>
      </DialogBody>
      <DialogFooter>
        <DialogClose asChild>
          <Button intent="secondary" disabled={pending}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" form={FORM_ID} intent="danger" disabled={pending}>
          {pending ? "Disabling…" : "Disable account"}
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * Disabling an account: it can't sign in, and its sessions and apps' access end now.
 *
 * Disabling re-renders the page with the account disabled while the dialog is still open, so
 * the page keeps this in its place and says `available={false}`: the button goes, but the
 * dialog stays mounted long enough to close and say it's done.
 */
export function DisableDialog({
  userId,
  name,
  available,
}: {
  userId: string;
  name: string;
  available: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {available ? (
        <DialogTrigger asChild>
          <Button intent="danger">Disable</Button>
        </DialogTrigger>
      ) : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Disable {name}?</DialogTitle>
          <DialogDescription>
            They're signed out everywhere now, apps lose access to their account, and they can't
            sign in until it's enabled. They get an email saying so.
          </DialogDescription>
        </DialogHeader>
        <DisableForm
          userId={userId}
          onDone={() => {
            setOpen(false);
            toast(`${name} is disabled`);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

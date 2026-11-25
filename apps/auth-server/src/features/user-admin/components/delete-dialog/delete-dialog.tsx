"use client";

import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Field,
  FieldControl,
  FieldError,
  FieldLabel,
  Input,
  toast,
} from "@nuvui/react";
import Form from "next/form";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { Turnstile } from "@/shared/ui/turnstile/turnstile";
import { deleteUserAction } from "../../actions/users";
import { USERS_PATH } from "../../paths";
import type { DeleteUserState } from "../../types";
import "./delete-dialog.scss";

const FORM_ID = "delete-user-form";

const INITIAL: DeleteUserState = { attempt: 0 };

/** The form, inside the dialog's content: each opening starts with an empty field. */
function DeleteForm({ userId, email, name }: { userId: string; email: string; name: string }) {
  const [state, formAction, pending] = useActionState(deleteUserAction, INITIAL);
  const [typed, setTyped] = useState("");
  const router = useRouter();
  const handled = useRef(0);

  useEffect(() => {
    if (!state.done || handled.current === state.attempt) return;
    handled.current = state.attempt;
    toast(`${name} was deleted`);
    // The account's page is gone with it.
    router.replace(USERS_PATH);
  }, [state, name, router]);

  return (
    <>
      <Form id={FORM_ID} action={formAction} className="delete-dialog__form" noValidate>
        <input type="hidden" name="userId" value={userId} />
        {state.formError ? (
          <Alert intent="danger">
            <AlertDescription>{state.formError}</AlertDescription>
          </Alert>
        ) : null}
        <Field required>
          <FieldLabel>
            Type <span className="delete-dialog__code">{email}</span> to confirm
          </FieldLabel>
          <FieldControl>
            <Input
              name="confirmation"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
          </FieldControl>
          <FieldError>{state.errors?.confirmation}</FieldError>
        </Field>
        <Turnstile />
      </Form>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>Keep the account</AlertDialogCancel>
        {/* A submit button, not AlertDialogAction: that one would close before the answer. */}
        <Button
          type="submit"
          form={FORM_ID}
          intent="danger"
          disabled={pending || typed.trim().toLowerCase() !== email.toLowerCase()}
        >
          {pending ? "Deleting…" : "Delete the account"}
        </Button>
      </AlertDialogFooter>
    </>
  );
}

/** Deleting an account for good, once its email address is typed. */
export function DeleteDialog({
  userId,
  email,
  name,
}: {
  userId: string;
  email: string;
  name: string;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button intent="danger" size="sm">
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
        <AlertDialogDescription>
          Their profile, sign-in methods, sessions, two-factor and every app's access are removed,
          and they get an email saying so. This can't be undone. The history of what admins did
          stays.
        </AlertDialogDescription>
        <DeleteForm userId={userId} email={email} name={name} />
      </AlertDialogContent>
    </AlertDialog>
  );
}

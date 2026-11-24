"use client";

import { EditIcon } from "@nuvui/icons";
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
  Spinner,
  Textarea,
  toast,
} from "@nuvui/react";
import Form from "next/form";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { Turnstile } from "@/shared/ui/turnstile/turnstile";
import { firstInvalidField } from "@/shared/validation/field-errors";
import { updateClientAction } from "../../actions/clients";
import { MAX_REDIRECT_URIS, UPDATE_CLIENT_FIELDS } from "../../schemas/client";
import type { ClientRow, UpdateClientState } from "../../types";
import "./edit-client-dialog.scss";

/**
 * The form, filled with the client as it is now. Rendered inside DialogContent, which unmounts
 * when the dialog closes, so every opening starts from the saved values.
 */
function EditClientPanel({
  client,
  onSaved,
}: {
  client: ClientRow;
  onSaved: (name: string) => void;
}) {
  const [state, formAction, pending] = useActionState<UpdateClientState, FormData>(
    updateClientAction,
    {
      status: "editing",
      values: { name: client.name, redirectUris: client.redirectUris.join("\n") },
      attempt: 0,
    },
  );
  const formRef = useRef<HTMLFormElement>(null);
  const formId = `edit-client-${client.clientId}`;

  useEffect(() => {
    if (state.status === "saved") {
      onSaved(state.name);
      return;
    }
    if (!state.errors) return;
    const field = firstInvalidField(state.errors, UPDATE_CLIENT_FIELDS);
    formRef.current?.querySelector<HTMLElement>(`[name="${field}"]`)?.focus();
  }, [state, onSaved]);

  // Saved: the dialog is closing.
  if (state.status === "saved") return null;

  const { values, errors, formError } = state;
  const kind = client.kind === "public" ? "public" : "confidential";
  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit {client.name}</DialogTitle>
        <DialogDescription>
          Its client ID stays the same, and so does its kind: it's a {kind} client.
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        {/* Keyed by attempt: a failed attempt remounts it with what was typed. */}
        <Form
          key={state.attempt}
          ref={formRef}
          id={formId}
          action={formAction}
          className="edit-client-dialog__form"
          noValidate
        >
          {formError ? (
            <Alert intent="danger">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}
          <input type="hidden" name="clientId" value={client.clientId} />
          <Field required>
            <FieldLabel>Name</FieldLabel>
            <FieldControl>
              <Input name="name" defaultValue={values.name} autoComplete="off" />
            </FieldControl>
            <FieldDescription>People see it when they're asked to allow access.</FieldDescription>
            <FieldError>{errors?.name}</FieldError>
          </Field>
          <Field required>
            <FieldLabel>Redirect URIs</FieldLabel>
            <FieldControl>
              <Textarea
                name="redirectUris"
                defaultValue={values.redirectUris}
                rows={3}
                spellCheck={false}
                autoCapitalize="none"
                placeholder="https://app.example.com/callback"
              />
            </FieldControl>
            <FieldDescription>
              One per line, up to {MAX_REDIRECT_URIS}. A sign-in that's under way with an address
              you remove fails when it comes back.
            </FieldDescription>
            <FieldError>{errors?.redirectUris}</FieldError>
          </Field>
          <Turnstile />
        </Form>
      </DialogBody>
      <DialogFooter>
        <DialogClose asChild>
          <Button intent="secondary">Cancel</Button>
        </DialogClose>
        {/* Outside the form in the page, and so tied to it by id. */}
        <Button type="submit" form={formId} disabled={pending}>
          {pending ? (
            <>
              <Spinner size="sm" label="" />
              Saving…
            </>
          ) : (
            "Save changes"
          )}
        </Button>
      </DialogFooter>
    </>
  );
}

/** The Edit button of a row, and its dialog. */
export function EditClientDialog({ client }: { client: ClientRow }) {
  const [open, setOpen] = useState(false);
  const saved = useCallback((name: string) => {
    setOpen(false);
    toast(`${name} was saved`, { intent: "success" });
  }, []);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button intent="ghost" size="sm" aria-label={`Edit ${client.name}`}>
          <EditIcon size={16} />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <EditClientPanel client={client} onSaved={saved} />
      </DialogContent>
    </Dialog>
  );
}

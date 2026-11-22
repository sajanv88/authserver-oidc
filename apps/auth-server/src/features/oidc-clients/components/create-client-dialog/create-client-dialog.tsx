"use client";

import { PlusIcon } from "@nuvui/icons";
import {
  Alert,
  AlertDescription,
  Button,
  ChoiceCardDescription,
  ChoiceCardTitle,
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
  RadioCard,
  RadioGroup,
  Spinner,
  Textarea,
} from "@nuvui/react";
import Form from "next/form";
import { useActionState, useEffect, useRef } from "react";
import { Turnstile } from "@/shared/ui/turnstile/turnstile";
import { firstInvalidField } from "@/shared/validation/field-errors";
import { createClientAction } from "../../actions/clients";
import { CREATE_CLIENT_FIELDS, MAX_REDIRECT_URIS } from "../../schemas/client";
import type { CreateClientState } from "../../types";
import { ClientCredentials } from "../client-credentials/client-credentials";
import "./create-client-dialog.scss";

const FORM_ID = "create-client-form";

const INITIAL: CreateClientState = {
  status: "editing",
  values: { name: "", kind: "public", redirectUris: "" },
  attempt: 0,
};

/**
 * The form, then the new client's credentials. Rendered inside DialogContent, which unmounts
 * when the dialog closes, so every opening starts with an empty form.
 */
function CreateClientPanel() {
  const [state, formAction, pending] = useActionState(createClientAction, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);

  // After a failed attempt, focus goes to the first field with a message.
  useEffect(() => {
    if (state.status !== "editing" || !state.errors) return;
    const field = firstInvalidField(state.errors, CREATE_CLIENT_FIELDS);
    const control =
      field === "kind"
        ? formRef.current?.querySelector<HTMLElement>('[role="radio"]')
        : formRef.current?.querySelector<HTMLElement>(`[name="${field}"]`);
    control?.focus();
  }, [state]);

  if (state.status === "created") {
    return (
      <>
        <DialogHeader>
          <DialogTitle>{state.credentials.name} is ready</DialogTitle>
          <DialogDescription>Configure the app with these values.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <ClientCredentials credentials={state.credentials} />
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button>Done</Button>
          </DialogClose>
        </DialogFooter>
      </>
    );
  }

  const { values, errors, formError } = state;
  return (
    <>
      <DialogHeader>
        <DialogTitle>New client</DialogTitle>
        <DialogDescription>
          An app that signs people in here. It uses the code flow with PKCE, and gets refresh tokens
          when it asks for offline access.
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        {/* Keyed by attempt: a failed attempt remounts it with what was typed. */}
        <Form
          key={state.attempt}
          ref={formRef}
          id={FORM_ID}
          action={formAction}
          className="create-client-dialog__form"
          noValidate
        >
          {formError ? (
            <Alert intent="danger">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}
          <Field required>
            <FieldLabel>Name</FieldLabel>
            <FieldControl>
              <Input name="name" defaultValue={values.name} autoComplete="off" />
            </FieldControl>
            <FieldDescription>People see it when they're asked to allow access.</FieldDescription>
            <FieldError>{errors?.name}</FieldError>
          </Field>
          <Field required>
            {/* A group isn't something a <label> can point at. */}
            <FieldLabel asChild>
              <span>Kind of app</span>
            </FieldLabel>
            <FieldControl>
              <RadioGroup
                name="kind"
                defaultValue={values.kind === "confidential" ? "confidential" : "public"}
                className="create-client-dialog__kinds"
              >
                <RadioCard value="public">
                  <ChoiceCardTitle>Public</ChoiceCardTitle>
                  <ChoiceCardDescription>
                    Runs in a browser or on a phone, where a secret can't be kept. No secret.
                  </ChoiceCardDescription>
                </RadioCard>
                <RadioCard value="confidential">
                  <ChoiceCardTitle>Confidential</ChoiceCardTitle>
                  <ChoiceCardDescription>
                    Runs on a server that can keep a secret. Gets a client secret.
                  </ChoiceCardDescription>
                </RadioCard>
              </RadioGroup>
            </FieldControl>
            <FieldError>{errors?.kind}</FieldError>
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
              One per line, up to {MAX_REDIRECT_URIS}. Sign-ins only ever return to these exact
              addresses.
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
        <Button type="submit" form={FORM_ID} disabled={pending}>
          {pending ? (
            <>
              <Spinner size="sm" label="" />
              Creating…
            </>
          ) : (
            "Create client"
          )}
        </Button>
      </DialogFooter>
    </>
  );
}

/** "New client", and the dialog it opens. */
export function CreateClientDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon size={16} />
          New client
        </Button>
      </DialogTrigger>
      <DialogContent>
        <CreateClientPanel />
      </DialogContent>
    </Dialog>
  );
}

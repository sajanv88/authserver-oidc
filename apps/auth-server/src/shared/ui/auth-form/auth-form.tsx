"use client";

import { Button, Spinner } from "@nuvui/react";
import Form from "next/form";
import { type ReactNode, useEffect, useRef } from "react";
import "./auth-form.scss";

type AuthFormProps = {
  /** The server action, as `useActionState` hands it back. */
  action: (formData: FormData) => void;
  /** The field to move focus to: the first one the server found wrong. */
  focus?: string | undefined;
  children: ReactNode;
};

/**
 * Browser validation is off: the server checks, and each field shows its own FieldError. Works
 * before JavaScript loads: the browser posts the form, and the page comes back with the answer.
 * Key it by the attempt, so a failed attempt remounts it with what was typed.
 */
export function AuthForm({ action, focus, children }: AuthFormProps) {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!focus) return;
    const element = form.current?.elements.namedItem(focus);
    // Some controls (OtpField) submit through a hidden input: focus what can be typed in.
    const target =
      element instanceof HTMLInputElement && element.type === "hidden"
        ? form.current?.querySelector<HTMLElement>("input:not([type=hidden])")
        : element;
    if (target instanceof HTMLElement) target.focus();
  }, [focus]);

  return (
    <Form ref={form} action={action} className="auth-form" noValidate>
      {children}
    </Form>
  );
}

type SubmitButtonProps = {
  pending: boolean;
  /** Said while pending: "Creating account…". */
  pendingLabel: string;
  /** A second submit button in the same form sends its own value under this name. */
  name?: string;
  value?: string;
  intent?: "primary" | "secondary" | "danger";
  /** As wide as the form, as on the auth pages. A settings form's button fits its label. */
  fill?: boolean;
  children: ReactNode;
};

export function SubmitButton({
  pending,
  pendingLabel,
  name,
  value,
  intent = "primary",
  fill = true,
  children,
}: SubmitButtonProps) {
  return (
    <Button
      type="submit"
      size={fill ? "lg" : "md"}
      intent={intent}
      className={fill ? "auth-form__submit" : undefined}
      disabled={pending}
      {...(name ? { name, value } : {})}
    >
      {pending ? (
        <>
          <Spinner size="sm" label="" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

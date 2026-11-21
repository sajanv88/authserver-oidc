import { Button, Spinner } from "@nuvui/react";
import type { FormEvent, ReactNode } from "react";
import "./auth-form.scss";

type AuthFormProps = {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
};

/**
 * The form of an auth page: fields stacked, browser validation off (each field shows its own
 * FieldError, from the same rules the server applies). Rendered inside the features' client
 * components.
 */
export function AuthForm({ onSubmit, children }: AuthFormProps) {
  return (
    <form className="auth-form" noValidate onSubmit={onSubmit}>
      {children}
    </form>
  );
}

type SubmitButtonProps = {
  pending: boolean;
  /** Said while pending: "Creating account…". */
  pendingLabel: string;
  children: ReactNode;
};

/** The one primary button of an auth form, full width, with a spinner while it's sending. */
export function SubmitButton({ pending, pendingLabel, children }: SubmitButtonProps) {
  return (
    <Button type="submit" size="lg" className="auth-form__submit" disabled={pending}>
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

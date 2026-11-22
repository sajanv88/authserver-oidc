"use client";

import { LogOutIcon } from "@nuvui/icons";
import { Button, Spinner } from "@nuvui/react";
import Form from "next/form";
import { useFormStatus } from "react-dom";
import { signOutAction } from "./sign-out-action";

function SignOutSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" intent="ghost" size="sm" disabled={pending}>
      {pending ? <Spinner size="sm" label="" /> : <LogOutIcon size={16} />}
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}

/** A form, so it works before JavaScript loads. */
export function SignOutButton() {
  return (
    <Form action={signOutAction}>
      <SignOutSubmit />
    </Form>
  );
}

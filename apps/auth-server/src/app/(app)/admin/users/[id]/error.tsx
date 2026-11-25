"use client";

import { AlertTriangleIcon } from "@nuvui/icons";
import {
  Button,
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@nuvui/react";
import Link from "next/link";

// The user's page couldn't be shown at all (a section that fails on its own has its own
// boundary). The error is logged on the server by onRequestError in instrumentation.ts; the
// admin sees the digest, which matches that log line, and never the message.
export default function UserError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest =
    error instanceof Error && "digest" in error && typeof error.digest === "string"
      ? error.digest
      : undefined;
  return (
    <Empty>
      <EmptyMedia>
        <AlertTriangleIcon />
      </EmptyMedia>
      <EmptyTitle asChild>
        <h1>Couldn't load this user</h1>
      </EmptyTitle>
      <EmptyDescription>
        Nothing was changed. Try again in a moment.
        {digest ? ` If it keeps happening, quote reference ${digest}.` : null}
      </EmptyDescription>
      <EmptyActions>
        <Button asChild intent="secondary">
          <Link href="/admin/users">Back to Users</Link>
        </Button>
        <Button onClick={() => retry()}>Try again</Button>
      </EmptyActions>
    </Empty>
  );
}

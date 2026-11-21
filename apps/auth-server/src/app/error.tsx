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

// The error itself is logged on the server by onRequestError in instrumentation.ts. The user
// sees the digest, which support can match to that log line, and never the message.
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="page page--centered" id="content">
      <Empty>
        <EmptyMedia>
          <AlertTriangleIcon />
        </EmptyMedia>
        <EmptyTitle asChild>
          <h1>Something went wrong</h1>
        </EmptyTitle>
        <EmptyDescription>
          Try again in a moment.
          {error.digest ? ` If it keeps happening, quote reference ${error.digest}.` : null}
        </EmptyDescription>
        <EmptyActions>
          <Button type="button" onClick={reset}>
            Try again
          </Button>
        </EmptyActions>
      </Empty>
    </main>
  );
}

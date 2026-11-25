"use client";

import { Alert, AlertActions, AlertDescription, AlertTitle, Button } from "@nuvui/react";
import { catchError, type ErrorInfo } from "next/error";

type SectionErrorProps = {
  /** What the section shows, as it reads after "couldn't load": "the sessions". */
  what: string;
};

// The error itself is logged on the server by onRequestError in instrumentation.ts; this says
// only that the section failed, never the message, and offers to load it again. The rest of the
// page stays usable. redirect() and notFound() pass through, as with error.tsx.
function SectionError({ what }: SectionErrorProps, { error, retry }: ErrorInfo) {
  const digest =
    error instanceof Error && "digest" in error && typeof error.digest === "string"
      ? error.digest
      : undefined;
  return (
    <Alert intent="danger">
      <AlertTitle>Couldn't load {what}</AlertTitle>
      <AlertDescription>
        Nothing was changed, and trying again is safe.
        {digest ? ` If it keeps happening, quote reference ${digest}.` : null}
      </AlertDescription>
      <AlertActions>
        <Button size="sm" intent="secondary" onClick={() => retry()}>
          Try again
        </Button>
      </AlertActions>
    </Alert>
  );
}

/** An error boundary around one section of a page: `<SectionBoundary what="the sessions">`. */
export const SectionBoundary = catchError(SectionError);

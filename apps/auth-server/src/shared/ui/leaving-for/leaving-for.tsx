"use client";

import { Alert, AlertActions, AlertDescription, AlertTitle, Button } from "@nuvui/react";
import { useEffect } from "react";

/**
 * On the way back to an app (its redirect URI, on another site). With JavaScript the browser
 * goes there at once; without it, this is a link to follow. A server redirect can't do it:
 * after a form POST, `form-action 'self'` blocks redirects to other sites.
 */
export function LeavingFor({
  url,
  title = "Taking you back to the app",
}: {
  url: string;
  /** Where the browser is going, in words. */
  title?: string;
}) {
  useEffect(() => {
    window.location.assign(url);
  }, [url]);

  return (
    <Alert intent="success" role="status">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>If nothing happens, continue yourself.</AlertDescription>
      <AlertActions>
        <Button asChild size="sm">
          <a href={url}>Continue</a>
        </Button>
      </AlertActions>
    </Alert>
  );
}

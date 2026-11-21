"use client";

import { CopyIcon } from "@nuvui/icons";
import { Alert, AlertDescription, AlertTitle, Button, toast } from "@nuvui/react";
import type { ClientCredentials as Credentials } from "../../types";
import "./client-credentials.scss";

function CopyButton({ value, label }: { value: string; label: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast(`${label} copied`, { intent: "success" });
    } catch {
      toast(`Couldn't copy. Select the ${label.toLowerCase()} and copy it yourself.`, {
        intent: "warning",
      });
    }
  }
  return (
    <Button type="button" intent="secondary" size="sm" onClick={copy} aria-label={`Copy ${label}`}>
      <CopyIcon size={16} />
      Copy
    </Button>
  );
}

/**
 * What an app is configured with: its client ID and, for a confidential client just created
 * or rotated, the secret. The secret is stored hashed, so this is the only time it's shown.
 */
export function ClientCredentials({ credentials }: { credentials: Credentials }) {
  return (
    <div className="client-credentials">
      <dl className="client-credentials__list">
        <div className="client-credentials__item">
          <dt className="client-credentials__term">Client ID</dt>
          <dd className="client-credentials__value">
            <code className="client-credentials__code">{credentials.clientId}</code>
            <CopyButton value={credentials.clientId} label="Client ID" />
          </dd>
        </div>
        {credentials.clientSecret ? (
          <div className="client-credentials__item">
            <dt className="client-credentials__term">Client secret</dt>
            <dd className="client-credentials__value">
              <code className="client-credentials__code">{credentials.clientSecret}</code>
              <CopyButton value={credentials.clientSecret} label="Client secret" />
            </dd>
          </div>
        ) : null}
      </dl>
      {credentials.clientSecret ? (
        <Alert intent="warning">
          <AlertTitle>Copy the secret now</AlertTitle>
          <AlertDescription>
            It's stored hashed and can't be shown again. If it's lost, rotate it for a new one.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert intent="info">
          <AlertDescription>
            A public client has no secret. It proves itself with PKCE (S256) on every sign-in.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

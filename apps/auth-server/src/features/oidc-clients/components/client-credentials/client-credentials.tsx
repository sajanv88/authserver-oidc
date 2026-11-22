"use client";

import { CopyIcon } from "@nuvui/icons";
import { Alert, AlertDescription, AlertTitle, Button, toast } from "@nuvui/react";
import { useRef } from "react";
import type { ClientCredentials as Credentials } from "../../types";
import "./client-credentials.scss";

/** Selects what's shown in `element`, as if dragged over. */
function selectContents(element: HTMLElement): Selection | null {
  const selection = window.getSelection();
  if (!selection) return null;
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
  return selection;
}

/**
 * Copies `text`, shown in `element`. The Clipboard API exists only in a secure context (HTTPS
 * or localhost), and local development runs on http://*.localtest.me, so there the text is
 * selected and copied with the older copy command. Left selected if that fails too.
 */
async function copyText(text: string, element: HTMLElement | null): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
  const selection = element ? selectContents(element) : null;
  if (!selection) return false;
  const copied = document.execCommand("copy");
  if (copied) selection.removeAllRanges();
  return copied;
}

/** A value and its Copy button. */
function CopyableValue({ value, label }: { value: string; label: string }) {
  const codeRef = useRef<HTMLElement>(null);
  async function copy() {
    if (await copyText(value, codeRef.current)) {
      toast(`${label} copied`, { intent: "success" });
    } else {
      toast(`Couldn't copy. Select the ${label.toLowerCase()} and copy it yourself.`, {
        intent: "warning",
      });
    }
  }
  return (
    <>
      <code ref={codeRef} className="client-credentials__code">
        {value}
      </code>
      <Button
        type="button"
        intent="secondary"
        size="sm"
        onClick={copy}
        aria-label={`Copy ${label}`}
      >
        <CopyIcon size={16} />
        Copy
      </Button>
    </>
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
            <CopyableValue value={credentials.clientId} label="Client ID" />
          </dd>
        </div>
        {credentials.clientSecret ? (
          <div className="client-credentials__item">
            <dt className="client-credentials__term">Client secret</dt>
            <dd className="client-credentials__value">
              <CopyableValue value={credentials.clientSecret} label="Client secret" />
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

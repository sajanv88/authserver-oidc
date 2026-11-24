import { toast } from "@nuvui/react";

// Copying a client ID or secret, for the client components that show them.

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

/** Copies `value`, shown in `element`, and says in a toast whether it worked. */
export async function copyWithToast(
  value: string,
  label: string,
  element: HTMLElement | null,
): Promise<void> {
  if (await copyText(value, element)) {
    toast(`${label} copied`, { intent: "success" });
  } else {
    toast(`Couldn't copy. Select the ${label.toLowerCase()} and copy it yourself.`, {
      intent: "warning",
    });
  }
}

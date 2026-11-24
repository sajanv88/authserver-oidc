"use client";

import { CopyIcon, DownloadIcon } from "@nuvui/icons";
import { Button, toast } from "@nuvui/react";
import "./backup-codes-list.scss";

/**
 * The backup codes, once: to copy or download now, since they're never shown again.
 * `appName` (APP_NAME) heads the copied text, so people know which account they're for.
 */
export function BackupCodesList({ codes, appName }: { codes: string[]; appName: string }) {
  const text = `${appName} backup codes. Each works once.\n\n${codes.join("\n")}\n`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast("Backup codes copied", { intent: "success" });
    } catch {
      toast("Couldn't copy. Select the codes and copy them yourself.", { intent: "warning" });
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "backup-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="backup-codes-list">
      <ol className="backup-codes-list__codes" aria-label="Backup codes">
        {codes.map((code) => (
          <li key={code} className="backup-codes-list__code">
            {code}
          </li>
        ))}
      </ol>
      <div className="backup-codes-list__actions">
        <Button type="button" intent="secondary" size="sm" onClick={copy}>
          <CopyIcon size={16} />
          Copy
        </Button>
        <Button type="button" intent="secondary" size="sm" onClick={download}>
          <DownloadIcon size={16} />
          Download
        </Button>
      </div>
    </div>
  );
}

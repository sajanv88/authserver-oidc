"use client";

import { CopyIcon } from "@nuvui/icons";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@nuvui/react";
import { useRef } from "react";
import { copyWithToast } from "../copy-text";
import "./copy-client-id.scss";

/** A client's ID in the list, with a button that copies it. */
export function CopyClientId({ clientId, name }: { clientId: string; name: string }) {
  const codeRef = useRef<HTMLElement>(null);
  return (
    <span className="copy-client-id">
      <code ref={codeRef} className="copy-client-id__code">
        {clientId}
      </code>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            intent="ghost"
            size="sm"
            className="copy-client-id__button"
            aria-label={`Copy the client ID of ${name}`}
            onClick={() => copyWithToast(clientId, "Client ID", codeRef.current)}
          >
            <CopyIcon size={16} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Copy</TooltipContent>
      </Tooltip>
    </span>
  );
}

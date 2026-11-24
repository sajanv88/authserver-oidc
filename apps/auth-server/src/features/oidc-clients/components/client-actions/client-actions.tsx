"use client";

import { EditIcon, MoreHorizontalIcon, RotateCwIcon, TrashIcon } from "@nuvui/icons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  Button,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  toast,
} from "@nuvui/react";
import { type MouseEvent, useRef, useState } from "react";
import { deleteClientAction, rotateClientSecretAction } from "../../actions/clients";
import type { ClientProblem, ClientRow, ClientCredentials as Credentials } from "../../types";
import { ClientCredentials } from "../client-credentials/client-credentials";
import { EditClientDialog } from "../edit-client-dialog/edit-client-dialog";
import "./client-actions.scss";

const PROBLEMS: Record<ClientProblem, string> = {
  "not-found": "That client no longer exists. Reload the page.",
  "not-confidential": "A public client has no secret to rotate.",
  "not-allowed": "This client wasn't made here, so it can't be changed here.",
  "invalid-redirect-uri": "That didn't work. Try again.",
  failed: "That didn't work. Try again in a moment.",
};

/** A dialog opened from the row's menu: it has no trigger of its own. */
export type MenuDialogProps = {
  client: ClientRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where focus goes when it closes: the menu's button, as the item that opened it is gone. */
  onCloseAutoFocus: (event: Event) => void;
};

function RotateSecret({ client, open, onOpenChange, onCloseAutoFocus }: MenuDialogProps) {
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState("");
  const [rotated, setRotated] = useState<Credentials | null>(null);

  async function rotate(event: MouseEvent) {
    // Keeps the dialog open until the server has answered.
    event.preventDefault();
    setWorking(true);
    setProblem("");
    const result = await rotateClientSecretAction(client.clientId);
    setWorking(false);
    if (!result.ok) {
      setProblem(PROBLEMS[result.problem]);
      return;
    }
    onOpenChange(false);
    setRotated(result.value);
  }

  return (
    <>
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          onOpenChange(next);
          if (!next) setProblem("");
        }}
      >
        <AlertDialogContent size="sm" onCloseAutoFocus={onCloseAutoFocus}>
          <AlertDialogTitle>Rotate the secret of {client.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            The current secret stops working at once. The app can't sign anyone in until it's
            configured with the new one.
          </AlertDialogDescription>
          {problem ? (
            <p role="alert" className="client-actions__problem">
              {problem}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={working}>Keep the secret</AlertDialogCancel>
            <AlertDialogAction intent="danger" disabled={working} onClick={rotate}>
              {working ? "Rotating…" : "Rotate secret"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* The new secret, once. A Dialog: it reports, it doesn't ask. */}
      <Dialog open={rotated !== null} onOpenChange={(next) => (next ? null : setRotated(null))}>
        <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
          <DialogHeader>
            <DialogTitle>New secret for {client.name}</DialogTitle>
            <DialogDescription>Configure the app with it now.</DialogDescription>
          </DialogHeader>
          <DialogBody>{rotated ? <ClientCredentials credentials={rotated} /> : null}</DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button>Done</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DeleteClient({ client, open, onOpenChange, onCloseAutoFocus }: MenuDialogProps) {
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState("");

  async function remove(event: MouseEvent) {
    event.preventDefault();
    setWorking(true);
    setProblem("");
    const result = await deleteClientAction(client.clientId);
    setWorking(false);
    if (!result.ok) {
      setProblem(PROBLEMS[result.problem]);
      return;
    }
    // The row goes with the refresh the action asked for.
    onOpenChange(false);
    toast(`${client.name} was deleted`);
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setProblem("");
      }}
    >
      <AlertDialogContent size="sm" onCloseAutoFocus={onCloseAutoFocus}>
        <AlertDialogTitle>Delete {client.name}?</AlertDialogTitle>
        <AlertDialogDescription>
          It can't sign anyone in any more. Its tokens stop working and everyone's consent to it is
          removed. This can't be undone.
        </AlertDialogDescription>
        {problem ? (
          <p role="alert" className="client-actions__problem">
            {problem}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={working}>Keep it</AlertDialogCancel>
          <AlertDialogAction intent="danger" disabled={working} onClick={remove}>
            {working ? "Deleting…" : "Delete client"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type Opened = "edit" | "rotate" | "delete" | null;

/** A row's actions: one menu, each item opening its dialog beside it. */
export function ClientActions({ client }: { client: ClientRow }) {
  const [opened, setOpened] = useState<Opened>(null);
  const menuButton = useRef<HTMLButtonElement>(null);

  function dialog(which: Exclude<Opened, null>) {
    return {
      client,
      open: opened === which,
      onOpenChange: (open: boolean) => setOpened(open ? which : null),
      onCloseAutoFocus: (event: Event) => {
        event.preventDefault();
        menuButton.current?.focus();
      },
    };
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={menuButton}
            intent="ghost"
            size="sm"
            className="client-actions__trigger"
            aria-label={`Actions for ${client.name}`}
          >
            <MoreHorizontalIcon size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setOpened("edit")}>
            <EditIcon size={16} />
            Edit
          </DropdownMenuItem>
          {client.kind === "confidential" ? (
            <DropdownMenuItem onSelect={() => setOpened("rotate")}>
              <RotateCwIcon size={16} />
              Rotate secret
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem intent="danger" onSelect={() => setOpened("delete")}>
            <TrashIcon size={16} />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Beside the menu, not inside its items: the menu takes its items off the page when it
          closes, and the dialogs would go with them. */}
      <EditClientDialog {...dialog("edit")} />
      {client.kind === "confidential" ? <RotateSecret {...dialog("rotate")} /> : null}
      <DeleteClient {...dialog("delete")} />
    </>
  );
}

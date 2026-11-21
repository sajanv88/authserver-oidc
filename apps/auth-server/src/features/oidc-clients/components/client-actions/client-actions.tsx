"use client";

import { RotateCwIcon, TrashIcon } from "@nuvui/icons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from "@nuvui/react";
import { type MouseEvent, useState } from "react";
import { deleteClientAction, rotateClientSecretAction } from "../../actions/clients";
import type { ClientProblem, ClientRow, ClientCredentials as Credentials } from "../../types";
import { ClientCredentials } from "../client-credentials/client-credentials";
import "./client-actions.scss";

const PROBLEMS: Record<ClientProblem, string> = {
  "not-found": "That client no longer exists. Reload the page.",
  "not-confidential": "A public client has no secret to rotate.",
  "invalid-redirect-uri": "That didn't work. Try again.",
  failed: "That didn't work. Try again in a moment.",
};

function RotateSecret({ client }: { client: ClientRow }) {
  const [confirming, setConfirming] = useState(false);
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
    setConfirming(false);
    setRotated(result.value);
  }

  return (
    <>
      <AlertDialog
        open={confirming}
        onOpenChange={(open) => {
          setConfirming(open);
          if (!open) setProblem("");
        }}
      >
        <AlertDialogTrigger asChild>
          <Button intent="secondary" size="sm" aria-label={`Rotate the secret of ${client.name}`}>
            <RotateCwIcon size={16} />
            Rotate secret
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent size="sm">
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
      <Dialog open={rotated !== null} onOpenChange={(open) => (open ? null : setRotated(null))}>
        <DialogContent>
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

function DeleteClient({ client }: { client: ClientRow }) {
  const [confirming, setConfirming] = useState(false);
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
    setConfirming(false);
    toast(`${client.name} was deleted`);
  }

  return (
    <AlertDialog
      open={confirming}
      onOpenChange={(open) => {
        setConfirming(open);
        if (!open) setProblem("");
      }}
    >
      <AlertDialogTrigger asChild>
        <Button intent="ghost" size="sm" aria-label={`Delete ${client.name}`}>
          <TrashIcon size={16} />
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
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

/** What can be done to one client: rotate its secret (confidential only), delete it. */
export function ClientActions({ client }: { client: ClientRow }) {
  return (
    <div className="client-actions">
      {client.kind === "confidential" ? <RotateSecret client={client} /> : null}
      <DeleteClient client={client} />
    </div>
  );
}

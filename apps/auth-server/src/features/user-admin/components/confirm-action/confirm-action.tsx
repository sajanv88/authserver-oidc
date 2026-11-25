"use client";

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
  toast,
} from "@nuvui/react";
import { type MouseEvent, type ReactNode, useState } from "react";
import { ADMIN_PROBLEMS } from "../../problems";
import type { AdminResult } from "../../types";
import "./confirm-action.scss";

type ConfirmActionProps = {
  /** The page's server action, with the user's id (and anything else) bound to it. */
  action: () => Promise<AdminResult>;
  /** The button that opens the dialog. */
  label: string;
  intent?: "primary" | "secondary" | "danger" | undefined;
  title: string;
  description: ReactNode;
  /** The dialog's button that does it, and what it says while it runs. */
  confirm: string;
  working: string;
  /** What the toast says once it's done. */
  done: string;
};

/**
 * A button that asks first, then runs the action. The page re-renders with what changed (the
 * action calls refresh()); a refusal stays in the dialog.
 */
export function ConfirmAction({
  action,
  label,
  intent = "secondary",
  title,
  description,
  confirm,
  working,
  done,
}: ConfirmActionProps) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [problem, setProblem] = useState("");

  async function run(event: MouseEvent) {
    // Keeps the dialog open until the server has answered.
    event.preventDefault();
    setRunning(true);
    setProblem("");
    const result = await action();
    setRunning(false);
    if (!result.ok) {
      setProblem(ADMIN_PROBLEMS[result.problem]);
      return;
    }
    setOpen(false);
    toast(done);
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setProblem("");
      }}
    >
      <AlertDialogTrigger asChild>
        <Button intent={intent}>{label}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
        {problem ? (
          <p role="alert" className="confirm-action__problem">
            {problem}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={running}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            intent={intent === "danger" ? "danger" : "primary"}
            disabled={running}
            onClick={run}
          >
            {running ? working : confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

import { ClockIcon } from "@nuvui/icons";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
  Timeline,
  TimelineContent,
  TimelineDescription,
  TimelineItem,
  TimelineMarker,
  TimelineTime,
  TimelineTitle,
} from "@nuvui/react";
import type { AdminActionKind } from "@repo/db";
import { Suspense } from "react";
import { SectionBoundary } from "@/shared/ui/section-boundary/section-boundary";
import { userHistoryForAdmin } from "../server/pages";
import type { HistoryEntry } from "../types";
import { momentFormat } from "./user-badges";
import { HistorySkeleton } from "./user-skeletons/user-skeletons";

/** What happened, in words: the marker's color only repeats it. */
function titleOf(entry: HistoryEntry): string {
  const titles: Record<AdminActionKind, string> = {
    "user.disable": entry.detail
      ? `Disabled until ${momentFormat.format(new Date(entry.detail))} UTC`
      : "Disabled until an admin enables it",
    "user.enable": "Enabled",
    "user.sign_out": "Signed out everywhere",
    "user.delete": "Deleted",
    "user.role": entry.detail === "admin" ? "Made an admin" : "Made a user",
    "user.two_factor.require": "Two-factor required",
    "user.two_factor.unrequire": "Two-factor no longer required",
    "user.two_factor.reset": "Two-factor reset",
  };
  return titles[entry.action];
}

const INTENT: Partial<Record<AdminActionKind, "danger" | "success" | "warning">> = {
  "user.disable": "danger",
  "user.delete": "danger",
  "user.enable": "success",
  "user.two_factor.reset": "warning",
};

/** What admins did to this account, newest first. */
function UserHistory({ entries, name }: { entries: HistoryEntry[]; name: string }) {
  return (
    <Timeline aria-label={`What admins did to ${name}'s account`}>
      {entries.map((entry) => (
        <TimelineItem key={entry.id}>
          <TimelineMarker intent={INTENT[entry.action] ?? "neutral"} />
          <TimelineContent>
            <TimelineTitle>{titleOf(entry)}</TimelineTitle>
            <TimelineDescription>By {entry.by}</TimelineDescription>
            <TimelineTime dateTime={entry.at}>
              {momentFormat.format(new Date(entry.at))} UTC
            </TimelineTime>
          </TimelineContent>
        </TimelineItem>
      ))}
    </Timeline>
  );
}

/** The timeline, which waits for the database: the card around it doesn't. */
async function HistoryEntries({ userId, name }: { userId: string; name: string }) {
  const entries = await userHistoryForAdmin(userId);
  if (entries.length === 0) {
    return (
      <Empty>
        <EmptyMedia>
          <ClockIcon />
        </EmptyMedia>
        <EmptyTitle asChild>
          <h3>Nothing yet</h3>
        </EmptyTitle>
        <EmptyDescription>No admin has changed this account.</EmptyDescription>
      </Empty>
    );
  }
  return <UserHistory entries={entries} name={name} />;
}

/** What admins did to the account, and who: "who disabled this?" months later. */
export function UserHistoryCard({ userId, name }: { userId: string; name: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle asChild>
          <h2>History</h2>
        </CardTitle>
        <CardDescription>What admins changed, newest first.</CardDescription>
      </CardHeader>
      <CardContent>
        <SectionBoundary what="the history">
          <Suspense fallback={<HistorySkeleton />}>
            <HistoryEntries userId={userId} name={name} />
          </Suspense>
        </SectionBoundary>
      </CardContent>
    </Card>
  );
}

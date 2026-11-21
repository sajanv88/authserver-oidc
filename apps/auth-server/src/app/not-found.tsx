import { CompassIcon } from "@nuvui/icons";
import {
  Button,
  Empty,
  EmptyActions,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
} from "@nuvui/react";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page page--centered" id="content">
      <Empty>
        <EmptyMedia>
          <CompassIcon />
        </EmptyMedia>
        <EmptyTitle asChild>
          <h1>Page not found</h1>
        </EmptyTitle>
        <EmptyDescription>The address may be mistyped, or the page has moved.</EmptyDescription>
        <EmptyActions>
          <Button asChild intent="secondary">
            <Link href="/">Back to the start</Link>
          </Button>
        </EmptyActions>
      </Empty>
    </main>
  );
}

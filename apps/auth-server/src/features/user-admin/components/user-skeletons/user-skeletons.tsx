import { Card, CardContent, CardHeader, Separator, Skeleton, VisuallyHidden } from "@nuvui/react";
import type { ReactNode } from "react";
import { RowsSkeleton } from "@/shared/ui/list-skeleton/list-skeleton";
import { UserBreadcrumb } from "../user-header/user-header";
import "../user-screen.scss";
import "./user-skeletons.scss";

// Placeholders in the shape of what's loading, built from the same parts, so nothing jumps when
// it arrives. The gray boxes are hidden from screen readers; aria-busy and a status say it.

export function SessionRowsSkeleton() {
  return <RowsSkeleton count={3} label="Loading the sessions" />;
}

export function HistorySkeleton() {
  return (
    <div aria-busy="true" className="user-skeletons__history">
      <VisuallyHidden role="status">Loading the history</VisuallyHidden>
      {Array.from({ length: 3 }, (_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed list, never reordered
        <div key={index} className="user-skeletons__event" aria-hidden="true">
          <Skeleton shape="circle" className="user-skeletons__marker" />
          <div className="user-skeletons__lines">
            <Skeleton shape="text" className="user-skeletons__line--title" />
            <Skeleton shape="text" className="user-skeletons__line--short" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A card with a title and a line under it, then whatever goes in it. */
function CardSkeleton({ children }: { children: ReactNode }) {
  return (
    <Card aria-hidden="true">
      <CardHeader>
        <Skeleton shape="text" className="user-skeletons__line--heading" />
        <Skeleton shape="text" className="user-skeletons__line--text" />
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** The whole of a user's page while it loads: the route's loading.tsx and the page's Suspense. */
export function UserScreenSkeleton() {
  return (
    <div className="user-screen" aria-busy="true">
      <VisuallyHidden role="status">Loading the user</VisuallyHidden>
      <UserBreadcrumb current={<Skeleton shape="text" className="user-skeletons__crumb" />} />
      <Card aria-hidden="true">
        <CardContent className="user-header__body">
          <div className="user-header__who">
            <Skeleton shape="circle" className="user-skeletons__avatar" />
            <div className="user-skeletons__lines">
              <Skeleton shape="text" className="user-skeletons__name" />
              <Skeleton shape="text" className="user-skeletons__line--short" />
            </div>
          </div>
          <Separator />
          <div className="user-header__facts">
            {["joined", "active", "devices", "two-factor"].map((fact) => (
              <div key={fact} className="user-skeletons__lines">
                <Skeleton shape="text" className="user-skeletons__line--short" />
                <Skeleton shape="text" className="user-skeletons__line--title" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <div className="user-screen__columns">
        <div className="user-screen__main">
          <CardSkeleton>
            <RowsSkeleton count={2} />
          </CardSkeleton>
          <CardSkeleton>
            <RowsSkeleton count={3} />
          </CardSkeleton>
        </div>
        <CardSkeleton>
          <HistorySkeleton />
        </CardSkeleton>
      </div>
    </div>
  );
}

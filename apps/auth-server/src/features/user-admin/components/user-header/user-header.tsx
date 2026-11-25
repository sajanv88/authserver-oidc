import {
  Badge,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Card,
  CardContent,
  Separator,
} from "@nuvui/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { UserAvatar } from "@/shared/ui/user-avatar/user-avatar";
import { USERS_PATH } from "../../paths";
import type { UserProfile } from "../../types";
import { dayFormat, StatusBadge, TwoFactorBadge } from "../user-badges";
import "./user-header.scss";

/** Users › the person. `current` is the person's name, or a placeholder while it loads. */
export function UserBreadcrumb({ current }: { current: ReactNode }) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href={USERS_PATH}>Users</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>{current}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function devicesText(count: number): string {
  if (count === 0) return "Nowhere right now";
  return count === 1 ? "1 device" : `${count} devices`;
}

/** Who this is, at a glance: picture, name, role and status, then the facts an admin asks first. */
export function UserHeader({ user, name }: { user: UserProfile; name: string }) {
  const facts = [
    { label: "Joined", value: dayFormat.format(new Date(user.createdAt)) },
    {
      label: "Last active",
      value: user.lastActiveAt ? dayFormat.format(new Date(user.lastActiveAt)) : "Never signed in",
    },
    { label: "Signed in on", value: devicesText(user.activeSessions) },
    { label: "Two-factor", value: <TwoFactorBadge state={user.twoFactor} /> },
  ];
  return (
    <Card className="user-header">
      <CardContent className="user-header__body">
        <div className="user-header__who">
          <UserAvatar user={user} size="lg" />
          <div className="user-header__about">
            <div className="user-header__heading">
              <h1 className="user-header__title">{name}</h1>
              <StatusBadge status={user.status} />
              {user.role === "admin" ? <Badge variant="outline">Admin</Badge> : null}
            </div>
            <p className="user-header__email">{user.email}</p>
          </div>
        </div>
        <Separator />
        <dl className="user-header__facts">
          {facts.map((fact) => (
            <div key={fact.label} className="user-header__fact">
              <dt className="user-header__label">{fact.label}</dt>
              <dd className="user-header__value">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

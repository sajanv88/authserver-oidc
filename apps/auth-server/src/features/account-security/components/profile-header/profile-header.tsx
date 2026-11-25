import { Badge } from "@nuvui/react";
import { UserAvatar } from "@/shared/ui/user-avatar/user-avatar";
import type { AccountUser } from "../../types";
import "./profile-header.scss";

const joined = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

/**
 * The top of the profile pages: who's signed in, and the facts the tabs below change. The
 * picture is decoration beside the name, so it's hidden from screen readers.
 */
export function ProfileHeader({
  user,
  signInWith,
}: {
  user: AccountUser;
  /** "Password and Google": how the account signs in. */
  signInWith: string;
}) {
  const name = user.name.trim() || user.email;
  const facts = [
    { label: "Member since", value: joined.format(user.createdAt) },
    { label: "Two-factor", value: user.twoFactorEnabled ? "On" : "Off" },
    { label: "Signs in with", value: signInWith },
  ];
  return (
    <header className="profile-header">
      <div className="profile-header__who">
        <UserAvatar user={user} size="lg" />
        <div className="profile-header__about">
          <div className="profile-header__heading">
            <h1 className="profile-header__title">{name}</h1>
            {user.role === "admin" ? <Badge variant="outline">Admin</Badge> : null}
          </div>
          <p className="profile-header__text">Signed in as {user.email}.</p>
        </div>
      </div>
      <dl className="profile-header__facts">
        {facts.map((fact) => (
          <div key={fact.label} className="profile-header__fact">
            <dt className="profile-header__label">{fact.label}</dt>
            <dd className="profile-header__value">{fact.value}</dd>
          </div>
        ))}
      </dl>
    </header>
  );
}

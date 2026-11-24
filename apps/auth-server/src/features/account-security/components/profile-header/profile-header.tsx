import { Avatar, AvatarFallback, AvatarImage, Badge } from "@nuvui/react";
import type { AccountUser } from "../../types";
import "./profile-header.scss";

const joined = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

/** Up to two initials from the name, or the email's first letter when there's no name. */
export function initialsOf({ name, email }: Pick<AccountUser, "name" | "email">): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words.at(-1)] : [words[0] ?? email];
  return letters.map((word) => (word ?? "").charAt(0).toUpperCase()).join("");
}

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
        <Avatar size="lg">
          {user.image ? <AvatarImage src={user.image} alt="" /> : null}
          <AvatarFallback aria-hidden="true">{initialsOf(user)}</AvatarFallback>
        </Avatar>
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

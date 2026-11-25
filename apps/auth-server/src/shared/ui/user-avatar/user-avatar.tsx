import { Avatar, AvatarFallback, AvatarImage } from "@nuvui/react";

type Person = { name: string; email: string; image?: string | null | undefined };

/** Up to two initials from the name, or the email's first letter when there's no name. */
export function initialsOf({ name, email }: Pick<Person, "name" | "email">): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words.at(-1)] : [words[0] ?? email];
  return letters.map((word) => (word ?? "").charAt(0).toUpperCase()).join("");
}

/**
 * Someone's picture, or their initials. Decoration beside their name, which says who it is, so
 * it's hidden from screen readers.
 */
export function UserAvatar({
  user,
  size,
}: {
  user: Person;
  size?: "sm" | "md" | "lg" | undefined;
}) {
  return (
    <Avatar size={size ?? "md"}>
      {user.image ? <AvatarImage src={user.image} alt="" /> : null}
      <AvatarFallback aria-hidden="true">{initialsOf(user)}</AvatarFallback>
    </Avatar>
  );
}

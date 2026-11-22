import * as v from "valibot";

/** Public: a browser or mobile app, no secret, PKCE only. Confidential: a server, with a secret. */
export const CLIENT_KINDS = ["public", "confidential"] as const;

export const MAX_REDIRECT_URIS = 10;

/** The redirect URIs typed into the textarea: one per line, blank lines ignored. */
export function redirectUriLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

/** An absolute http(s) address without a fragment (RFC 6749 3.1.2). */
function isRedirectUri(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return (url.protocol === "https:" || url.protocol === "http:") && !value.includes("#");
}

export const CreateClientSchema = v.object({
  name: v.pipe(
    v.string("Give the app a name."),
    v.trim(),
    v.nonEmpty("Give the app a name."),
    v.maxLength(100, "Keep the name under 100 characters."),
  ),
  kind: v.picklist(CLIENT_KINDS, "Choose the kind of app."),
  redirectUris: v.pipe(
    v.string("Add at least one redirect URI."),
    v.transform(redirectUriLines),
    v.minLength(1, "Add at least one redirect URI."),
    v.maxLength(MAX_REDIRECT_URIS, `Add at most ${MAX_REDIRECT_URIS} redirect URIs.`),
    v.check(
      (uris) => uris.every(isRedirectUri),
      "Write each one in full, like https://app.example.com/callback, without a # part.",
    ),
  ),
});

export type CreateClientInput = v.InferOutput<typeof CreateClientSchema>;
export type CreateClientField = keyof CreateClientInput;

/** The order the fields appear in, for moving focus to the first one that's wrong. */
export const CREATE_CLIENT_FIELDS = ["name", "kind", "redirectUris"] as const;

export const ClientIdSchema = v.pipe(v.string(), v.trim(), v.nonEmpty(), v.maxLength(200));

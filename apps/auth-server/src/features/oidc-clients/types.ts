import type { FieldErrors } from "@/shared/validation/field-errors";
import type { CLIENT_KINDS, CreateClientField } from "./schemas/client";

export type ClientKind = (typeof CLIENT_KINDS)[number];

/** A row of the client list: what an admin needs to see, never the secret. */
export type ClientRow = {
  clientId: string;
  name: string;
  kind: ClientKind;
  redirectUris: string[];
  disabled: boolean;
  /** ISO 8601. */
  createdAt: string;
};

/** What an app is configured with. The secret is there once, right after it's made. */
export type ClientCredentials = {
  name: string;
  clientId: string;
  clientSecret?: string | undefined;
};

/** What went wrong with a request to the plugin, in words for the screen to choose. */
export type ClientProblem = "invalid-redirect-uri" | "not-found" | "not-confidential" | "failed";

export type ClientResult<T> = { ok: true; value: T } | { ok: false; problem: ClientProblem };

/** The values typed into the create form, sent back so a failed attempt keeps them. */
export type CreateClientValues = { name: string; kind: string; redirectUris: string };

export type CreateClientState =
  | {
      status: "editing";
      values: CreateClientValues;
      errors?: FieldErrors<CreateClientField> | undefined;
      formError?: string | undefined;
      /** Changes with every answer, so the form takes the values back even when they're equal. */
      attempt: number;
    }
  | { status: "created"; credentials: ClientCredentials };

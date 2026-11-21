/** One thing an app asks for, in words. */
export type ScopeItem = { scope: string; title: string; description: string };

/** What the consent page's query turned out to be, before the session and the client. */
export type ConsentRequest =
  /** Not an authorization request this server signed: nothing to resume. */
  | { status: "invalid" }
  /** Signed here, but older than 10 minutes (or altered): start the request again. */
  | { status: "expired"; restartUrl: string | undefined }
  | { status: "valid"; clientId: string; scopes: ScopeItem[]; restartUrl: string | undefined };

/** What /consent renders. */
export type ConsentPageContext =
  | { status: "invalid" }
  | { status: "expired"; restartUrl: string | undefined }
  | {
      status: "ready";
      clientName: string;
      scopes: ScopeItem[];
      /** Who is giving consent. */
      email: string;
      /** For starting again if the request expires while the page is open. */
      restartUrl: string | undefined;
    };

export type ConsentState =
  | { status: "deciding"; problem?: ConsentProblem | undefined }
  | { status: "sending"; decision: "allow" | "deny" }
  /** Answered: the browser is on its way back to the app. */
  | { status: "leaving" };

export type ConsentProblem = { kind: "message"; text: string } | { kind: "expired" };

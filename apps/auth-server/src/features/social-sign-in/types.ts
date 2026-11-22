import type { SocialProvider } from "@/shared/auth/social-providers";

/** Why the last sign-in with a provider didn't go through, in words for the person. */
export type SocialProblem = { title?: string | undefined; text: string };

/** What the buttons need from the page: plain values, so they cross to the client. */
export type SocialSignInContext = {
  providers: SocialProvider[];
  /** Better Auth's signed authorization query, when an app sent the browser here. */
  oidcQuery: string;
  /** Where to land after the provider, outside an app's flow (already made safe). */
  returnTo: string;
  /** Better Auth sent the browser back here with ?error=. */
  problem?: SocialProblem | undefined;
};

export type SocialSignInState =
  | { status: "idle"; attempt: number }
  | { status: "failed"; attempt: number; message: string }
  /** On the way to the provider's own sign-in page. */
  | { status: "leaving"; attempt: number; url: string; providerName: string };

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@nuvui/react";
import Link from "next/link";
import { isSignInErrorCode, type SignInErrorCode } from "nextidp/next";
import { auth } from "../server/auth";
import { SignOutForm } from "./sign-out-form";
import "./oidc-card.scss";

const ERRORS: Record<SignInErrorCode, { title: string; text: string }> = {
  access_denied: {
    title: "You chose Deny",
    text: "The app got nothing. Sign in again to allow it.",
  },
  expired: {
    title: "That sign-in had expired",
    text: "A sign-in has to finish within 10 minutes. Start again.",
  },
  state_mismatch: {
    title: "That sign-in wasn't started here",
    text: "The answer didn't match the request this browser made, so it was ignored.",
  },
  token_failed: {
    title: "The code couldn't be redeemed",
    text: "The auth server refused it. Start the sign-in again.",
  },
  invalid_id_token: {
    title: "The ID token didn't check out",
    text: "Its signature, issuer, audience, expiry or nonce was wrong, so it was refused.",
  },
  refresh_failed: {
    title: "The session couldn't be refreshed",
    text: "The refresh token was refused (used, revoked or expired). Sign in again.",
  },
};

/** Sign in with OIDC: code + PKCE, then the ID token checked against the issuer's keys. */
export async function OidcCard({ error }: { error?: string | undefined }) {
  const session = await auth.session();
  const problem = isSignInErrorCode(error) ? ERRORS[error] : undefined;
  const who = session?.claims.email ?? session?.claims.sub;
  return (
    <Card>
      <CardHeader>
        <CardTitle asChild>
          <h2>Sign in with OIDC</h2>
        </CardTitle>
        <CardDescription>
          Authorization code with PKCE (S256), then the ID token verified with the auth server's
          keys from /jwks: issuer, audience, expiry and nonce.
        </CardDescription>
        <CardAction>
          <Badge intent={session ? "success" : "neutral"}>
            {session ? "Signed in" : "Signed out"}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="oidc-card__content">
        {problem ? (
          <Alert intent="warning">
            <AlertTitle>{problem.title}</AlertTitle>
            <AlertDescription>{problem.text}</AlertDescription>
          </Alert>
        ) : null}
        <p className="oidc-card__text">
          {session
            ? `This app has its own session for ${String(who)}, from the ID token.`
            : "This app has no session of its own yet."}
        </p>
      </CardContent>
      <CardFooter className="oidc-card__footer">
        {session ? (
          <>
            <Button asChild>
              <Link href="/me">See the tokens</Link>
            </Button>
            <SignOutForm />
          </>
        ) : (
          <Button asChild>
            {/* A route handler that redirects to the auth server: a plain link. */}
            <a href="/oidc/login">Sign in with OIDC</a>
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

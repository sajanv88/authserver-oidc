import type { Metadata } from "next";
import { LoginScreen, loginPageContext } from "@/features/login";
import { SocialSignIn, socialSignInPageContext } from "@/features/social-sign-in";

export const metadata: Metadata = { title: "Sign in" };

// Reads the session to send signed-in visitors on: blocks on it, by design.
export const instant = false;

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { query, social } = socialSignInPageContext(await searchParams);
  return (
    <LoginScreen
      {...(await loginPageContext(query))}
      social={social ? <SocialSignIn {...social} /> : null}
    />
  );
}

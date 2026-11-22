import type { Metadata } from "next";
import { SignUpScreen, signUpPageContext } from "@/features/signup";
import { SocialSignIn, socialSignInPageContext } from "@/features/social-sign-in";

export const metadata: Metadata = { title: "Create an account" };

// Reads the session to send signed-in visitors on: blocks on it, by design.
export const instant = false;

export default async function SignUpPage({ searchParams }: PageProps<"/signup">) {
  const { query, social } = socialSignInPageContext(await searchParams);
  return (
    <SignUpScreen
      {...(await signUpPageContext(query))}
      social={social ? <SocialSignIn {...social} /> : null}
    />
  );
}

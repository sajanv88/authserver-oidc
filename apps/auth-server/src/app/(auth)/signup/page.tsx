import type { Metadata } from "next";
import { SignUpScreen, signUpPageContext } from "@/features/signup";

export const metadata: Metadata = { title: "Create an account" };

// Reads the session to send signed-in visitors on: blocks on it, by design.
export const instant = false;

export default async function SignUpPage({ searchParams }: PageProps<"/signup">) {
  return <SignUpScreen {...(await signUpPageContext(await searchParams))} />;
}

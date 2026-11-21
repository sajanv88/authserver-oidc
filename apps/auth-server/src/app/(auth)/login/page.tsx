import type { Metadata } from "next";
import { LoginScreen, loginPageContext } from "@/features/login";

export const metadata: Metadata = { title: "Sign in" };

// Reads the session to send signed-in visitors on: blocks on it, by design.
export const instant = false;

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  return <LoginScreen {...(await loginPageContext(await searchParams))} />;
}

import "server-only";
import { cookies } from "next/headers";
import { APPEARANCE_COOKIE, type Appearance, parseAppearance } from "./appearance";

export async function readAppearance(): Promise<Appearance> {
  return parseAppearance((await cookies()).get(APPEARANCE_COOKIE)?.value);
}

import * as v from "valibot";
import { SSO_PROVIDER_ID } from "@/shared/auth/social-providers";

export const SocialSignInSchema = v.object({
  provider: v.picklist(
    ["google", "microsoft", "github", SSO_PROVIDER_ID],
    "Choose a way to sign in.",
  ),
});

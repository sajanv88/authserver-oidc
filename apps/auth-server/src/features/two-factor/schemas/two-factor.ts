import * as v from "valibot";
import { CurrentPasswordSchema } from "@/shared/validation/fields";

/** A code from an authenticator app: six digits, changing every 30 seconds. */
export const TotpCodeSchema = v.pipe(
  v.string(),
  v.trim(),
  v.nonEmpty("Enter the 6-digit code from your authenticator app."),
  v.regex(/^\d{6}$/, "Enter all 6 digits from your authenticator app."),
);

/** One of the ten backup codes: xxxxx-xxxxx, letters and digits, case-sensitive. */
export const BackupCodeSchema = v.pipe(
  v.string(),
  v.trim(),
  v.nonEmpty("Enter one of your backup codes."),
  v.regex(
    /^[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$/,
    "Enter a backup code like Ab3dE-f9Hk2, with the dash.",
  ),
);

const TrustDeviceSchema = v.optional(
  v.pipe(
    v.literal("on"),
    v.transform(() => true),
  ),
  undefined,
);

/** The second step of signing in, with a code from the app. */
export const VerifyTotpSchema = v.object({ code: TotpCodeSchema, trustDevice: TrustDeviceSchema });

/** The second step of signing in, with a backup code. */
export const VerifyBackupCodeSchema = v.object({
  code: BackupCodeSchema,
  trustDevice: TrustDeviceSchema,
});

/** Settings changes ask for the password first. */
export const PasswordConfirmSchema = v.object({ password: CurrentPasswordSchema });

/** Confirming a new authenticator during setup. */
export const ConfirmTotpSchema = v.object({ code: TotpCodeSchema });

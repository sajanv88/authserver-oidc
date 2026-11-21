import * as v from "valibot";
import { EmailSchema } from "@/shared/validation/fields";

/** Asking for a sign-in link. */
export const MagicLinkSchema = v.object({ email: EmailSchema });

export type MagicLinkInput = v.InferOutput<typeof MagicLinkSchema>;

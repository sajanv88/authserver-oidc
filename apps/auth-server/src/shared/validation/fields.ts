import * as v from "valibot";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/shared/auth/constants";

// Field rules shared by the auth forms. They run in the browser for instant, inline messages;
// Better Auth checks the same rules again on the server. Messages say what to do.

export const EmailSchema = v.pipe(
  v.string(),
  v.trim(),
  v.toLowerCase(),
  v.nonEmpty("Enter your email address."),
  v.maxLength(254, "Use an email address of at most 254 characters."),
  v.email("Enter an email address like name@example.com."),
);

/** A password being chosen: the same length rules Better Auth enforces. */
export const NewPasswordSchema = v.pipe(
  v.string(),
  v.minLength(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`),
  v.maxLength(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters.`),
);

/** A password being typed to sign in: only that there is one. */
export const CurrentPasswordSchema = v.pipe(v.string(), v.nonEmpty("Enter your password."));

export const NameSchema = v.pipe(
  v.string(),
  v.trim(),
  v.nonEmpty("Enter your name."),
  v.maxLength(100, "Use at most 100 characters."),
);

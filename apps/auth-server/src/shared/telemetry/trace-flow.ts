import "server-only";
import { type Attributes, SpanStatusCode, trace } from "@opentelemetry/api";
import { unstable_rethrow } from "next/navigation";
import { TELEMETRY_SCOPE, telemetryInstruments } from "./instruments";

/**
 * Every step this app traces: the span's name, and `auth.flow` on its metric. A new server
 * action that signs someone in, changes their credentials or changes a client gets one here.
 */
export type AuthFlow =
  | "auth.login"
  | "auth.signup"
  | "auth.signup.resend_verification"
  | "auth.password_reset.request"
  | "auth.password_reset.complete"
  | "auth.magic_link.request"
  | "auth.two_factor.verify"
  | "auth.social.start"
  | "auth.consent"
  | "auth.consent.switch_account"
  | "auth.sign_out"
  | "account.password.change"
  | "account.session.revoke"
  | "account.sign_out_everywhere"
  | "account.two_factor.setup.start"
  | "account.two_factor.setup.confirm"
  | "account.two_factor.backup_codes"
  | "account.two_factor.disable"
  | "admin.client.create"
  | "admin.client.rotate_secret"
  | "admin.client.delete";

/** Outcomes are metric attributes: short fixed words only, never text from a request. */
const OUTCOME = /^[a-z][a-z0-9_-]{0,39}$/;

function word(value: unknown): string | undefined {
  return typeof value === "string" && OUTCOME.test(value) ? value : undefined;
}

/** A problem's name: "message" is a refusal explained in words, the rest name themselves. */
function problemName(problem: unknown): string | undefined {
  if (typeof problem === "string") return word(problem);
  if (problem && typeof problem === "object" && "kind" in problem) {
    return problem.kind === "message" ? "refused" : word(problem.kind);
  }
  return undefined;
}

/**
 * The outcome of a step, read from what the feature's server function returned: its `kind`
 * ("sent", "two-factor", "verified"…), a problem's name, `ok` / `failed`, or a boolean. Anything
 * else is "other", so a metric never gets an attribute value nobody chose.
 */
export function outcomeOf(result: unknown): string {
  if (result === undefined || result === true) return "ok";
  if (result === false) return "failed";
  if (typeof result !== "object" || result === null) return "other";
  if ("kind" in result) {
    if (result.kind === "problem" && "problem" in result) {
      return problemName(result.problem) ?? "other";
    }
    return word(result.kind) ?? "other";
  }
  if ("ok" in result) {
    if (result.ok === true) return "ok";
    return ("problem" in result ? problemName(result.problem) : undefined) ?? "failed";
  }
  return "other";
}

/** Next's redirect() and notFound() throw to stop rendering: that's a way out, not a failure. */
function isNextControlFlow(error: unknown): boolean {
  try {
    unstable_rethrow(error);
    return false;
  } catch {
    return true;
  }
}

/**
 * Runs one step of an auth flow in its own span, `flow`, under the request's span (Better Auth's
 * endpoint and database spans nest under it in turn), and records its duration by outcome in
 * the `auth.flow.duration` histogram. The span gets `auth.flow`, `auth.outcome` and
 * `attributes`; never put an email, name, password, code or token in them. A thrown error
 * marks the span as failed with only the error's type: messages can carry query parameters.
 */
export async function traceFlow<T>(
  flow: AuthFlow,
  run: () => Promise<T>,
  attributes: Attributes = {},
): Promise<T> {
  const tracer = trace.getTracer(TELEMETRY_SCOPE);
  return tracer.startActiveSpan(
    flow,
    { attributes: { ...attributes, "auth.flow": flow } },
    async (span) => {
      const started = performance.now();
      const finish = (outcome: string) => {
        span.setAttribute("auth.outcome", outcome);
        span.end();
        telemetryInstruments().flowDuration.record((performance.now() - started) / 1000, {
          "auth.flow": flow,
          "auth.outcome": outcome,
        });
      };
      try {
        const result = await run();
        finish(outcomeOf(result));
        return result;
      } catch (error) {
        if (isNextControlFlow(error)) {
          finish("redirect");
        } else {
          const type = error instanceof Error ? error.name : typeof error;
          span.setAttribute("error.type", type);
          span.setStatus({ code: SpanStatusCode.ERROR, message: type });
          finish("error");
        }
        throw error;
      }
    },
  );
}

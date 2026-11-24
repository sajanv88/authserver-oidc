import { SpanStatusCode } from "@opentelemetry/api";
import { redirect } from "next/navigation";
import { describe, expect, it } from "vitest";
import { installTestTelemetry } from "./testing";
import { outcomeOf, traceFlow } from "./trace-flow";

const telemetry = installTestTelemetry();

describe("outcomeOf", () => {
  it("names the outcome from what a feature's server function returns", () => {
    expect(outcomeOf({ kind: "two-factor" })).toBe("two-factor");
    expect(outcomeOf({ kind: "problem", problem: { kind: "unverified", email: "a@b.c" } })).toBe(
      "unverified",
    );
    expect(outcomeOf({ kind: "problem", problem: { kind: "message", text: "No." } })).toBe(
      "refused",
    );
    expect(outcomeOf({ ok: true, value: 1 })).toBe("ok");
    expect(outcomeOf({ ok: false, problem: "not-found" })).toBe("not-found");
    expect(outcomeOf({ ok: false, problem: { kind: "expired" } })).toBe("expired");
    expect(outcomeOf({ ok: false, message: "Wrong code." })).toBe("failed");
    expect(outcomeOf(true)).toBe("ok");
    expect(outcomeOf(false)).toBe("failed");
    expect(outcomeOf(undefined)).toBe("ok");
  });

  it("never passes on a value nobody chose", () => {
    expect(outcomeOf({ kind: "Something the user typed" })).toBe("other");
    expect(outcomeOf({ ok: false, problem: "x".repeat(80) })).toBe("failed");
    expect(outcomeOf("signed-in")).toBe("other");
    expect(outcomeOf(null)).toBe("other");
  });
});

describe("traceFlow", () => {
  // Each test reads its own flow: spans and the cumulative histogram build up across tests.
  it("records a span and a duration with the step's outcome", async () => {
    const result = await traceFlow("auth.login", async () => ({ kind: "signed-in" }), {
      "auth.oidc_flow": true,
    });
    expect(result).toEqual({ kind: "signed-in" });

    const span = telemetry.spans().find((item) => item.name === "auth.login");
    expect(span?.attributes).toMatchObject({
      "auth.flow": "auth.login",
      "auth.outcome": "signed-in",
      "auth.oidc_flow": true,
    });
    expect(span?.status.code).toBe(SpanStatusCode.UNSET);

    const points = await telemetry.histogram("auth.flow.duration");
    expect(points).toContainEqual(
      expect.objectContaining({
        attributes: { "auth.flow": "auth.login", "auth.outcome": "signed-in" },
        count: 1,
      }),
    );
  });

  it("treats Next's redirect as a way out, not a failure", async () => {
    await expect(traceFlow("auth.sign_out", async () => redirect("/login"))).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });

    const span = telemetry.spans().find((item) => item.name === "auth.sign_out");
    expect(span?.attributes["auth.outcome"]).toBe("redirect");
    expect(span?.status.code).toBe(SpanStatusCode.UNSET);
  });

  it("marks a thrown error with its type only, and throws it on", async () => {
    const failure = new TypeError("insert failed, params: someone@example.com");
    await expect(
      traceFlow("admin.client.create", async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    const span = telemetry.spans().find((item) => item.name === "admin.client.create");
    expect(span?.attributes).toMatchObject({
      "auth.outcome": "error",
      "error.type": "TypeError",
    });
    expect(span?.status).toEqual({ code: SpanStatusCode.ERROR, message: "TypeError" });
    expect(span?.events).toEqual([]);
    expect(JSON.stringify(span?.attributes)).not.toContain("example.com");

    const points = await telemetry.histogram("auth.flow.duration");
    expect(points).toContainEqual(
      expect.objectContaining({
        attributes: { "auth.flow": "admin.client.create", "auth.outcome": "error" },
      }),
    );
  });
});

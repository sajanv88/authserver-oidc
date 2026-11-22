// Which Microsoft emails count as verified (nOAuth): checked through Better Auth's own
// Microsoft provider, built with this server's options, reading ID tokens shaped the way
// Entra ID sends them.
import { microsoft } from "better-auth/social-providers";
import { UnsecuredJWT } from "jose";
import { describe, expect, it } from "vitest";
import {
  MICROSOFT_CONSUMER_TENANT_ID,
  microsoftEmailVerified,
  socialProviderOptions,
} from "./social-providers";

const OWN_TENANT = "5a1c3f0e-2b7d-4f6a-9e8c-1d2b3c4d5e6f";
const OTHER_TENANT = "0f9e8d7c-6b5a-4c3d-8e2f-1a0b9c8d7e6f";

function idToken(claims: Record<string, unknown>): string {
  return new UnsecuredJWT({ oid: "object-id", name: "Someone", ...claims }).encode();
}

async function emailVerifiedFor(claims: Record<string, unknown>, tenantId = "common") {
  const options = socialProviderOptions({
    microsoft: { clientId: "id", clientSecret: "secret", tenantId },
  })?.microsoft;
  // Better Auth's type also allows a function; ours is always the options themselves.
  if (!options || typeof options === "function") throw new Error("microsoft isn't configured");
  const info = await microsoft(options).getUserInfo({ idToken: idToken(claims) });
  return info?.user.emailVerified;
}

describe("Microsoft emails", () => {
  it("doesn't trust another organisation's claims that its user's email is verified", async () => {
    // What a tenant's admin can put on any user: Better Auth alone would call it verified.
    const forged = {
      tid: OTHER_TENANT,
      email: "victim@example.com",
      email_verified: true,
      verified_primary_email: ["victim@example.com"],
    };
    expect(await emailVerifiedFor(forged)).toBe(false);
    expect(await emailVerifiedFor(forged, "organizations")).toBe(false);
  });

  it("trusts Microsoft's domain check (xms_edov), personal accounts, and the configured tenant", async () => {
    expect(
      await emailVerifiedFor({ tid: OTHER_TENANT, email: "a@contoso.com", xms_edov: true }),
    ).toBe(true);
    expect(
      await emailVerifiedFor({ tid: MICROSOFT_CONSUMER_TENANT_ID, email: "a@outlook.com" }),
    ).toBe(true);
    expect(await emailVerifiedFor({ tid: OWN_TENANT, email: "a@ours.com" }, OWN_TENANT)).toBe(true);
    expect(await emailVerifiedFor({ tid: OTHER_TENANT, email: "a@theirs.com" }, OWN_TENANT)).toBe(
      false,
    );
  });

  it("never calls a missing email verified", () => {
    expect(microsoftEmailVerified({ tid: MICROSOFT_CONSUMER_TENANT_ID }, "common")).toBe(false);
    expect(microsoftEmailVerified({ xms_edov: "1", email: "" }, "common")).toBe(false);
  });
});

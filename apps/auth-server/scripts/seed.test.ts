// The seed against the real auth configuration (PGlite): what it makes, and that a second run
// makes nothing new.
import { beforeAll, describe, expect, it } from "vitest";
import { createHarness } from "@/shared/auth/test-harness";
import { SeedError, seed } from "./seed-core";

type Harness = Awaited<ReturnType<typeof createHarness>>;

const redirectUri = "http://app.localtest.me:3001/oidc/callback";
const postLogoutRedirectUri = "http://app.localtest.me:3001/";
const input = {
  admin: { email: "admin@localtest.me", password: "seed admin passphrase", name: "Admin" },
  client: { name: "Example app", redirectUri, postLogoutRedirectUri },
};

describe("the seed", () => {
  let h: Harness;
  let clientId = "";

  beforeAll(async () => {
    h = await createHarness();
  });

  it("makes a confirmed admin and a public PKCE client, and leaves no session", async () => {
    const result = await seed(h.auth, h.database, input);
    expect(result.admin).toEqual({ email: "admin@localtest.me", status: "created" });
    expect(result.client.status).toBe("created");
    clientId = result.client.clientId;

    const { rows: users } = await h.sql("select role, email_verified from users where email = $1", [
      "admin@localtest.me",
    ]);
    expect(users).toEqual([{ role: "admin", email_verified: true }]);
    const { rows: clients } = await h.sql(
      "select name, redirect_uris, post_logout_redirect_uris, enable_end_session, token_endpoint_auth_method, require_pkce, grant_types, client_secret from oauth_clients",
    );
    expect(clients).toEqual([
      {
        name: "Example app",
        redirect_uris: [redirectUri],
        post_logout_redirect_uris: [postLogoutRedirectUri],
        enable_end_session: true,
        token_endpoint_auth_method: "none",
        require_pkce: true,
        grant_types: ["authorization_code", "refresh_token"],
        client_secret: null,
      },
    ]);
    const { rows: sessions } = await h.sql("select 1 from sessions");
    expect(sessions).toEqual([]);
  });

  it("run again, finds both instead of making them twice", async () => {
    expect(await seed(h.auth, h.database, input)).toEqual({
      admin: { email: "admin@localtest.me", status: "existing" },
      client: { clientId, status: "existing" },
    });
    const { rows } = await h.sql("select count(*)::int as n from oauth_clients");
    expect(rows).toEqual([{ n: 1 }]);
  });

  it("adds the post-logout address to an example client seeded before it had one", async () => {
    await h.sql(
      "update oauth_clients set post_logout_redirect_uris = null, enable_end_session = null where client_id = $1",
      [clientId],
    );
    expect((await seed(h.auth, h.database, input)).client).toEqual({ clientId, status: "updated" });
    const { rows } = await h.sql(
      "select post_logout_redirect_uris, enable_end_session from oauth_clients where client_id = $1",
      [clientId],
    );
    expect(rows).toEqual([
      { post_logout_redirect_uris: [postLogoutRedirectUri], enable_end_session: true },
    ]);
    expect((await seed(h.auth, h.database, input)).client.status).toBe("existing");
  });

  it("the admin it makes can sign in with the password given", async () => {
    const response = await h.browser("203.0.113.170").request("POST", "/api/auth/sign-in/email", {
      json: { email: "admin@localtest.me", password: input.admin.password },
    });
    expect(response.status).toBe(200);
  });

  it("says so when the admin exists with another password", async () => {
    await expect(
      seed(h.auth, h.database, {
        ...input,
        admin: { ...input.admin, password: "not the admin's password" },
      }),
    ).rejects.toThrow(SeedError);
  });
});

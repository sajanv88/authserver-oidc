// Provisioning against the real auth configuration (PGlite): what it creates, that a second run
// updates instead of duplicating, and what it refuses.
import { beforeAll, describe, expect, it } from "vitest";
import { BASE_URL, createHarness } from "@/shared/auth/test-harness";
import { type ProvisionFile, parseProvisionFile, provision } from "./provision-core";

type Harness = Awaited<ReturnType<typeof createHarness>>;

const api = "https://api.localtest.me";
const adminApi = "https://admin-api.localtest.me";
const oauth = { resources: [api, adminApi], resourceLifetimes: {}, apiScopes: ["crm", "booking"] };
const adminEmail = "ops@localtest.me";

function file(clients: unknown[]): ProvisionFile {
  return parseProvisionFile({ clients });
}

const zone = {
  type: "web",
  name: "Platform web",
  redirectUris: ["https://app.localtest.me/api/auth/callback"],
  postLogoutRedirectUris: ["https://app.localtest.me/"],
  backchannelLogoutUri: "https://app.localtest.me/api/auth/backchannel-logout",
  firstParty: true,
  scopes: ["crm"],
  resources: [api],
};
const jobs = { type: "machine", name: "Platform jobs", scopes: ["crm"], resources: [api] };

describe("provisioning clients", () => {
  let h: Harness;
  let first: Awaited<ReturnType<typeof provision>>;

  beforeAll(async () => {
    h = await createHarness({ oauth });
    await h.auth.api.signUpEmail({
      body: { email: adminEmail, password: "ops admin passphrase", name: "Ops" },
    });
    // An admin with two-factor on: the script doesn't sign in with a password, so it still works.
    await h.sql(
      "update users set role = 'admin', email_verified = true, two_factor_enabled = true where email = $1",
      [adminEmail],
    );
    first = await provision(h.auth, h.database, {
      adminEmail,
      file: file([zone, jobs]),
      oauth,
    });
  });

  it("creates a first-party zone and a service, each with a secret shown once", async () => {
    expect(first.map(({ name, status }) => ({ name, status }))).toEqual([
      { name: "Platform web", status: "created" },
      { name: "Platform jobs", status: "created" },
    ]);
    expect(first.every((result) => (result.clientSecret ?? "").length >= 32)).toBe(true);

    const { rows } = await h.sql(
      `select name, token_endpoint_auth_method, grant_types, scopes, client_credentials_scopes,
              skip_consent, enable_end_session, require_pkce, backchannel_logout_uri,
              post_logout_redirect_uris, client_secret, metadata
         from oauth_clients order by created_at`,
    );
    const [web, machine] = rows as Record<string, unknown>[];
    expect(rows.map((row) => (row as { metadata: unknown }).metadata)).toEqual([
      { provisioned_by: "clients:provision" },
      { provisioned_by: "clients:provision" },
    ]);
    expect(web).toMatchObject({
      name: "Platform web",
      token_endpoint_auth_method: "client_secret_basic",
      grant_types: ["authorization_code", "refresh_token"],
      scopes: ["openid", "profile", "email", "offline_access", "crm"],
      skip_consent: true,
      enable_end_session: true,
      require_pkce: true,
      backchannel_logout_uri: zone.backchannelLogoutUri,
      post_logout_redirect_uris: zone.postLogoutRedirectUris,
    });
    expect(machine).toMatchObject({
      name: "Platform jobs",
      grant_types: ["client_credentials"],
      client_credentials_scopes: ["crm"],
    });
    // Stored hashed, never as issued.
    expect(rows.map((row) => (row as { client_secret: string }).client_secret)).not.toContain(
      first[0]?.clientSecret,
    );

    const { rows: links } = await h.sql(
      "select client_id, resource_id from oauth_client_resources order by client_id",
    );
    expect(links).toHaveLength(2);
    expect(links.every((link) => (link as { resource_id: string }).resource_id === api)).toBe(true);
  });

  it("leaves no session behind", async () => {
    const { rows } = await h.sql("select 1 from sessions");
    expect(rows).toEqual([]);
  });

  it("gives the service tokens for the API with the secret it printed", async () => {
    const service = first[1];
    const response = await h.auth.handler(
      new Request(`${BASE_URL}/api/auth/oauth2/token`, {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from(`${service?.clientId}:${service?.clientSecret}`).toString("base64")}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          scope: "crm",
          resource: api,
        }).toString(),
      }),
    );
    expect(response.status).toBe(200);
  });

  it("run again, updates the same clients, relinks the APIs, and prints no secret", async () => {
    const changedZone = {
      ...zone,
      redirectUris: ["https://app.localtest.me/api/auth/callback", "https://localtest.me/cb"],
      scopes: ["crm", "booking"],
      resources: [adminApi],
    };
    const changedJobs = { ...jobs, scopes: ["crm", "booking"] };
    const again = await provision(h.auth, h.database, {
      adminEmail,
      file: file([changedZone, changedJobs]),
      oauth,
    });
    expect(again).toEqual([
      { name: "Platform web", clientId: first[0]?.clientId, status: "updated" },
      { name: "Platform jobs", clientId: first[1]?.clientId, status: "updated" },
    ]);

    const { rows } = await h.sql(
      "select name, redirect_uris, scopes, client_credentials_scopes from oauth_clients order by created_at",
    );
    expect(rows).toEqual([
      expect.objectContaining({
        redirect_uris: changedZone.redirectUris,
        scopes: ["openid", "profile", "email", "offline_access", "crm", "booking"],
      }),
      expect.objectContaining({ client_credentials_scopes: ["crm", "booking"] }),
    ]);
    const { rows: links } = await h.sql(
      "select resource_id from oauth_client_resources where client_id = $1",
      [first[0]?.clientId],
    );
    expect(links).toEqual([{ resource_id: adminApi }]);
  });

  it("refuses to turn a zone into a service", async () => {
    await expect(
      provision(h.auth, h.database, {
        adminEmail,
        file: file([{ ...jobs, name: "Platform web" }]),
        oauth,
      }),
    ).rejects.toThrow(/exists as a web client; the file says machine/);
  });

  it("never takes over a client an admin registered under the same name, and changes nothing", async () => {
    // Someone else's app, registered on the admin screen: no provisioning mark.
    await h.sql(
      "insert into oauth_clients (client_id, name, redirect_uris, skip_consent) values ($1, $2, $3, false)",
      ["partner-app", "Partner app", ["https://partner.example.com/cb"]],
    );
    await expect(
      provision(h.auth, h.database, {
        adminEmail,
        file: file([
          { ...jobs, name: "Brand new" },
          { ...zone, name: "Partner app" },
        ]),
        oauth,
      }),
    ).rejects.toThrow(/Partner app exists but wasn't created by this script/);

    const { rows } = await h.sql(
      "select name, skip_consent from oauth_clients where name in ('Partner app', 'Brand new')",
    );
    expect(rows).toEqual([{ name: "Partner app", skip_consent: false }]);
    const { rows: links } = await h.sql(
      "select 1 from oauth_client_resources where client_id = 'partner-app'",
    );
    expect(links).toEqual([]);
  });

  it("refuses to drop logout URIs the server can't clear", async () => {
    const { backchannelLogoutUri: _, ...withoutBackchannel } = zone;
    await expect(
      provision(h.auth, h.database, { adminEmail, file: file([withoutBackchannel]), oauth }),
    ).rejects.toThrow(/removes its back-channel logout URI/);
    await expect(
      provision(h.auth, h.database, {
        adminEmail,
        file: file([{ ...zone, postLogoutRedirectUris: [] }]),
        oauth,
      }),
    ).rejects.toThrow(/removes its post-logout redirect URIs/);
    const { rows } = await h.sql(
      "select backchannel_logout_uri, post_logout_redirect_uris from oauth_clients where name = 'Platform web'",
    );
    expect(rows).toEqual([
      {
        backchannel_logout_uri: zone.backchannelLogoutUri,
        post_logout_redirect_uris: zone.postLogoutRedirectUris,
      },
    ]);
  });

  it("refuses scopes and APIs this server doesn't offer, before changing anything", async () => {
    await expect(
      provision(h.auth, h.database, {
        adminEmail,
        file: file([
          { ...jobs, name: "New", scopes: ["billing"] },
          { ...jobs, name: "Newer", resources: ["https://other.localtest.me"] },
        ]),
        oauth,
      }),
    ).rejects.toThrow(/"billing" isn't in OAUTH_API_SCOPES[\s\S]*isn't in OAUTH_RESOURCES/);
    const { rows } = await h.sql("select 1 from oauth_clients where name in ('New', 'Newer')");
    expect(rows).toEqual([]);
  });

  it("refuses anyone who isn't an admin", async () => {
    await expect(
      provision(h.auth, h.database, {
        adminEmail: "nobody@localtest.me",
        file: file([jobs]),
        oauth,
      }),
    ).rejects.toThrow(/isn't an admin/);
  });
});

describe("the clients file", () => {
  it("takes web and machine clients, with defaults", () => {
    expect(
      parseProvisionFile({
        clients: [
          { type: "web", name: "App", redirectUris: ["https://app.example.com/cb"] },
          { type: "machine", name: "Jobs", scopes: ["crm"] },
        ],
      }).clients,
    ).toEqual([
      {
        type: "web",
        name: "App",
        redirectUris: ["https://app.example.com/cb"],
        postLogoutRedirectUris: [],
        firstParty: false,
        scopes: [],
        resources: [],
      },
      { type: "machine", name: "Jobs", scopes: ["crm"], resources: [] },
    ]);
  });

  it("refuses a repeated name, a web client without redirect URIs, and an unknown type", () => {
    expect(() =>
      parseProvisionFile({
        clients: [
          { type: "machine", name: "Jobs", scopes: ["crm"] },
          { type: "machine", name: "Jobs", scopes: ["crm"] },
        ],
      }),
    ).toThrow(/its own name/);
    expect(() =>
      parseProvisionFile({ clients: [{ type: "web", name: "App", redirectUris: [] }] }),
    ).toThrow(/clients\.0\.redirectUris: needs at least one redirect URI/);
    expect(() => parseProvisionFile({ clients: [{ type: "spa", name: "App" }] })).toThrow(
      /isn't valid/,
    );
  });
});

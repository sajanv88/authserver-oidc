import { randomUUID } from "node:crypto";
import { expect, type Locator, type Page } from "@playwright/test";
import type { DataTable } from "playwright-bdd";
import { APP_URL, AUTH_URL, adminCredentials } from "../support/env";
import { createAccount } from "../support/people";
import { expectSignedIn, field, openDialog, openDialogFromMenu, submitSignIn } from "../support/ui";
import { Given, me, Then, When, type World } from "./fixtures";

type Client = NonNullable<World["client"]>;

function clientOf(world: World): Client {
  if (!world.client) throw new Error("No app registered yet.");
  return world.client;
}

function clientRow(page: Page, client: Client): Locator {
  return page.getByRole("row").filter({ hasText: client.clientId });
}

/** The button that opens a row's menu: Edit, Rotate secret, Delete. */
function actionsOf(page: Page, client: Client): Locator {
  return clientRow(page, client).getByRole("button", { name: `Actions for ${client.name}` });
}

/** The values in the credentials list of a dialog: client ID, then the secret if any. */
async function credentials(dialog: Locator): Promise<string[]> {
  return dialog.getByRole("definition").locator("code").allTextContents();
}

async function registerConfidentialApp(page: Page, world: World): Promise<Locator> {
  const id = randomUUID().slice(0, 8);
  const name = `E2E app ${id}`;
  const redirectUri = `https://app-${id}.example.com/callback`;
  await page.goto("/admin/clients");
  const dialog = page.getByRole("dialog");
  await openDialog(page.getByRole("button", { name: "New client" }), dialog);
  await field(dialog, "Name").fill(name);
  await dialog.getByRole("radio", { name: /^Confidential/ }).click();
  await field(dialog, "Redirect URIs").fill(redirectUri);
  await dialog.getByRole("button", { name: "Create client" }).click();
  await expect(dialog.getByRole("heading", { name: `${name} is ready` })).toBeVisible();
  const [clientId = "", secret = ""] = await credentials(dialog);
  world.client = { name, redirectUri, clientId, secret };
  return dialog;
}

async function startOidcSignIn(page: Page): Promise<void> {
  await page.goto(APP_URL);
  await page.getByRole("link", { name: "Sign in with OIDC" }).click();
}

async function expectAppSignedIn(page: Page, email: string): Promise<void> {
  await expect(page).toHaveURL(`${APP_URL}/me`);
  await expect(page.getByRole("heading", { name: "ID token" })).toBeVisible();
  await expect(page.getByText("Valid", { exact: true })).toBeVisible();
  // From /oauth2/userinfo, asked for with the access token.
  await expect(page.getByText(email, { exact: true }).first()).toBeVisible();
}

Given("I am signed in as an admin", async ({ page }) => {
  const admin = adminCredentials();
  await submitSignIn(page, admin.email, admin.password);
  await expectSignedIn(page, admin.email);
});

Given("I have registered a confidential app", async ({ page, world }) => {
  const dialog = await registerConfidentialApp(page, world);
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(clientRow(page, clientOf(world))).toBeVisible();
});

Given(
  "I have signed in to the example app with OIDC and allowed it",
  async ({ page, world, mailbox }) => {
    world.person = await createAccount(mailbox);
    await startOidcSignIn(page);
    await submitSignIn(page, world.person.email, world.person.password);
    await page.getByRole("button", { name: "Allow" }).click();
    await expectAppSignedIn(page, world.person.email);
  },
);

When("I register a confidential app", async ({ page, world }) => {
  await registerConfidentialApp(page, world);
});

When("I copy the client ID", async ({ page }) => {
  await page.getByRole("dialog").getByRole("button", { name: "Copy Client ID" }).click();
});

When("I close the dialog", async ({ page }) => {
  await page.getByRole("dialog").getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
});

When("I rotate its secret", async ({ page, world }) => {
  const client = clientOf(world);
  const confirm = page.getByRole("alertdialog");
  await openDialogFromMenu(page, actionsOf(page, client), "Rotate secret", confirm);
  await confirm.getByRole("button", { name: "Rotate secret" }).click();
});

When("I delete it", async ({ page, world }) => {
  const client = clientOf(world);
  const confirm = page.getByRole("alertdialog");
  await openDialogFromMenu(page, actionsOf(page, client), "Delete", confirm);
  await confirm.getByRole("button", { name: "Delete client" }).click();
  // Exact: the toast's live region repeats it as "Notification …".
  await expect(page.getByText(`${client.name} was deleted`, { exact: true })).toBeVisible();
});

When("I open the OIDC clients page", async ({ page }) => {
  await page.goto("/admin/clients");
});

When("I sign in to the example app with OIDC", async ({ page }) => {
  await startOidcSignIn(page);
  await expect(page).toHaveURL(new RegExp(`^${AUTH_URL}/login\\?`));
});

When("I sign in to the example app with OIDC again", async ({ page }) => {
  await startOidcSignIn(page);
});

When("I allow it", async ({ page }) => {
  await page.getByRole("button", { name: "Allow" }).click();
});

When("I deny it", async ({ page }) => {
  await page.getByRole("button", { name: "Deny" }).click();
});

When("I sign out of the example app", async ({ page }) => {
  await page.getByRole("button", { name: "Sign out of this app" }).click();
  await expect(page).toHaveURL(`${APP_URL}/`);
  await expect(page.getByText("This app has no session of its own yet.")).toBeVisible();
});

When("I sign out of the example app and of the auth server", async ({ page }) => {
  await page.getByRole("button", { name: "Sign out of the auth server too" }).click();
});

Then("I am back on the example app, signed out", async ({ page }) => {
  // Through the auth server's end-session endpoint, then to the registered address.
  await expect(page).toHaveURL(`${APP_URL}/`);
  await expect(page.getByText("This app has no session of its own yet.")).toBeVisible();
});

Then("I am signed out of the auth server", async ({ page }) => {
  await page.goto(`${AUTH_URL}/account/security`);
  await expect(page).toHaveURL(new RegExp(`^${AUTH_URL}/login\\?`));
});

When("the example app refreshes its tokens", async ({ page }) => {
  await page.getByRole("button", { name: "Refresh the tokens" }).click();
});

When("I open the example app", async ({ page }) => {
  await page.goto(APP_URL);
});

Then("I am shown its client ID and its secret", async ({ world }) => {
  const client = clientOf(world);
  expect(client.clientId).toMatch(/^\S{16,}$/);
  expect(client.secret).toMatch(/^\S{16,}$/);
});

Then("I am told the client ID was copied", async ({ page }) => {
  await expect(page.getByText("Client ID copied", { exact: true })).toBeVisible();
});

Then("the app is listed as confidential, with its redirect URI", async ({ page, world }) => {
  const row = clientRow(page, clientOf(world));
  await expect(row).toBeVisible();
  await expect(row.getByText(clientOf(world).name)).toBeVisible();
  await expect(row.getByText("Confidential", { exact: true })).toBeVisible();
  await expect(row.getByText(clientOf(world).redirectUri)).toBeVisible();
});

Then("I am shown a new secret, not the old one", async ({ page, world }) => {
  const client = clientOf(world);
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: `New secret for ${client.name}` }),
  ).toBeVisible();
  const [clientId, secret] = await credentials(dialog);
  expect(clientId).toBe(client.clientId);
  expect(secret).toMatch(/^\S{16,}$/);
  expect(secret).not.toBe(client.secret);
});

Then("it is no longer listed", async ({ page, world }) => {
  await expect(clientRow(page, clientOf(world))).toHaveCount(0);
  await page.reload();
  await expect(clientRow(page, clientOf(world))).toHaveCount(0);
});

Then("I am told the page can't be found", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});

Then("I am asked to allow the example app to:", async ({ page }, table: DataTable) => {
  await expect(page).toHaveURL(new RegExp(`^${AUTH_URL}/consent\\?`));
  await expect(
    page.getByRole("heading", { name: /^Allow .+ to use your account\?$/ }),
  ).toBeVisible();
  for (const [scope = ""] of table.raw()) {
    await expect(page.getByText(scope, { exact: true })).toBeVisible();
  }
});

Then("the example app has signed me in with a verified ID token", async ({ page, world }) => {
  await expectAppSignedIn(page, me(world).email);
});

Then("the example app says I chose Deny", async ({ page }) => {
  await expect(page).toHaveURL(`${APP_URL}/?error=access_denied`);
  await expect(page.getByText("You chose Deny")).toBeVisible();
});

Then("the example app says the tokens were refreshed", async ({ page }) => {
  await expect(page).toHaveURL(`${APP_URL}/me?refreshed=1`);
  await expect(page.getByText("Tokens refreshed")).toBeVisible();
});

Then("the example app sees that I am signed in here", async ({ page, world }) => {
  await expect(page.getByText("Signed in", { exact: true })).toBeVisible();
  await expect(page.getByText(me(world).email, { exact: true })).toBeVisible();
});

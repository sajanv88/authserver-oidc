import { expect, type Locator, type Page } from "@playwright/test";
import { type TwoFactor, totp, turnOnTwoFactor } from "../support/authenticator";
import { AUTH_URL } from "../support/env";
import { createAccount } from "../support/people";
import {
  expectSignedIn,
  expectSignedOut,
  field,
  openDialog,
  submitAndWait,
  submitSignIn,
} from "../support/ui";
import { Given, me, Then, When, type World } from "./fixtures";

function twoFactorOf(world: World): TwoFactor {
  if (!world.twoFactor) throw new Error("Two-factor isn't on yet.");
  return world.twoFactor;
}

/** Types a code into nuvui's OtpField: one box per digit, filled from the first. */
async function typeCode(page: Page, scope: Locator, code: string): Promise<void> {
  await scope.getByRole("textbox", { name: "Character 1 of 6" }).click();
  await page.keyboard.type(code);
}

async function enterAppCode(page: Page, code: string): Promise<void> {
  await expect(page).toHaveURL(new RegExp(`^${AUTH_URL}/two-factor`));
  await typeCode(page, page.getByRole("tabpanel"), code);
  await page.getByRole("button", { name: "Verify" }).click();
}

async function enterBackupCode(page: Page, code: string): Promise<void> {
  await expect(page).toHaveURL(new RegExp(`^${AUTH_URL}/two-factor`));
  // The tabs need React; until it has hydrated a click on one does nothing.
  await expect(async () => {
    await page.getByRole("tab", { name: "Backup code" }).click();
    await expect(field(page, "Backup code")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await field(page, "Backup code").fill(code);
  await page.getByRole("button", { name: "Verify" }).click();
}

Given("I have an account with two-factor authentication on", async ({ world, mailbox }) => {
  world.person = await createAccount(mailbox);
  world.twoFactor = await turnOnTwoFactor(world.person);
});

Given("I am signed in with two-factor authentication on", async ({ page, world, mailbox }) => {
  world.person = await createAccount(mailbox);
  world.twoFactor = await turnOnTwoFactor(world.person);
  await submitSignIn(page, world.person.email, world.person.password);
  await enterAppCode(page, totp(world.twoFactor.setupKey));
  await expectSignedIn(page, world.person.email);
});

When("I set up two-factor authentication with my authenticator app", async ({ page, world }) => {
  const dialog = page.getByRole("dialog");
  await openDialog(page.getByRole("button", { name: "Set up two-factor" }), dialog);
  await field(dialog, "Your password").fill(me(world).password);
  await dialog.getByRole("button", { name: "Continue" }).click();

  // The setup key is shown for typing in, in groups of four.
  await expect(dialog.getByText("Add this account to your app")).toBeVisible();
  const setupKey = (await dialog.locator("code").first().textContent())?.replace(/\s/g, "") ?? "";
  expect(setupKey).toMatch(/^[A-Z2-7]{16,}$/);
  await typeCode(page, dialog, totp(setupKey));
  await submitAndWait(page, dialog.getByRole("button", { name: "Turn on two-factor" }));
  world.twoFactor = { setupKey, backupCodes: [] };
});

When("I enter the current code from my authenticator app", async ({ page, world }) => {
  await enterAppCode(page, totp(twoFactorOf(world).setupKey));
});

When("I enter a code that isn't the current one", async ({ page, world }) => {
  const current = totp(twoFactorOf(world).setupKey);
  await enterAppCode(page, current === "000000" ? "111111" : "000000");
});

When("I enter one of my backup codes", async ({ page, world }) => {
  const code = twoFactorOf(world).backupCodes[0];
  if (!code) throw new Error("No backup codes.");
  world.usedBackupCode = code;
  await enterBackupCode(page, code);
});

When("I sign out and sign in again with my email and password", async ({ page, world }) => {
  await page.getByRole("banner").getByRole("button", { name: "Sign out", exact: true }).click();
  await expectSignedOut(page);
  await submitSignIn(page, me(world).email, me(world).password);
});

When("I enter the same backup code again", async ({ page, world }) => {
  if (!world.usedBackupCode) throw new Error("No backup code used yet.");
  await enterBackupCode(page, world.usedBackupCode);
});

When("I turn off two-factor authentication with my password", async ({ page, world }) => {
  const dialog = page.getByRole("dialog");
  await openDialog(page.getByRole("button", { name: "Turn off", exact: true }), dialog);
  await field(dialog, "Your password").fill(me(world).password);
  await submitAndWait(page, dialog.getByRole("button", { name: "Turn off two-factor" }));
});

Then("I am given {int} backup codes to save", async ({ page }, count: number) => {
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Save your backup codes")).toBeVisible();
  const codes = await dialog
    .getByRole("list", { name: "Backup codes" })
    .getByRole("listitem")
    .allTextContents();
  expect(new Set(codes).size).toBe(count);
});

// The settings card, as the server renders it: what the account has, not what a toast said.
Then("two-factor authentication is on", async ({ page }) => {
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole("button", { name: "Turn off", exact: true })).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "New backup codes" })).toBeVisible();
});

Then("two-factor authentication is off", async ({ page }) => {
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole("button", { name: "Set up two-factor" })).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: 30_000 });
});

Then("I am asked for a code from my authenticator app", async ({ page }) => {
  await expect(page).toHaveURL(new RegExp(`^${AUTH_URL}/two-factor`));
  await expect(page.getByRole("heading", { name: "Two-factor authentication" })).toBeVisible();
});

Then("I am told the code didn't match", async ({ page }) => {
  await expect(page.getByText(/^That code didn't match/)).toBeVisible();
});

Then("I am told the backup code didn't match or was already used", async ({ page }) => {
  await expect(
    page.getByText("That backup code didn't match, or it was already used."),
  ).toBeVisible();
});

Then("no sign-in link is emailed to me", async ({ world, mailbox }) => {
  await mailbox.expectNone(me(world).email, "Your sign-in link");
});

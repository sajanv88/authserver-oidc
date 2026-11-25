import { expect, type Page } from "@playwright/test";
import { AUTH_URL } from "../support/env";
import { createAccount, type Person } from "../support/people";
import { expectSignedIn, expectSignedOut, field, openDialog, submitSignIn } from "../support/ui";
import { Given, Then, When, type World } from "./fixtures";

function someoneOf(world: World): Person {
  if (!world.someone) throw new Error("No one to manage yet: start with a Given about someone.");
  return world.someone;
}

function theirDeviceOf(world: World): Page {
  if (!world.theirDevice) throw new Error("They haven't signed in on a device of their own.");
  return world.theirDevice;
}

/** Opens their admin page from a search for their email. */
async function openTheirPage(page: Page, person: Person): Promise<void> {
  await page.goto(`/admin/users?q=${encodeURIComponent(person.email)}`);
  await page.getByRole("link", { name: person.name, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: person.name })).toBeVisible();
}

/** Presses one of their page's buttons, then the confirming button in the dialog it opens. */
async function confirmOnTheirPage(page: Page, button: string, confirm: string): Promise<void> {
  const dialog = page.getByRole("alertdialog");
  await openDialog(page.getByRole("button", { name: button, exact: true }), dialog);
  await dialog.getByRole("button", { name: confirm, exact: true }).click();
  await expect(dialog).toBeHidden();
}

/** A toast's words. Exact: the toast's live region repeats them as "Notification …". */
async function expectToast(page: Page, text: string): Promise<void> {
  await expect(page.getByText(text, { exact: true })).toBeVisible();
}

Given("there is someone with an account", async ({ world, mailbox }) => {
  world.someone = await createAccount(mailbox);
});

Given("someone is signed in on their device", async ({ world, mailbox, newDevice }) => {
  world.someone = await createAccount(mailbox);
  world.theirDevice = await newDevice();
  await submitSignIn(world.theirDevice, world.someone.email, world.someone.password);
  await expectSignedIn(world.theirDevice, world.someone.email);
});

When("I search the users for their email", async ({ page, world }) => {
  await page.goto("/admin/users");
  await page.getByRole("searchbox", { name: "Name or email" }).fill(someoneOf(world).email);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/[?&]q=/);
});

When("I disable their account", async ({ page, world }) => {
  const person = someoneOf(world);
  await openTheirPage(page, person);
  const dialog = page.getByRole("dialog");
  await openDialog(page.getByRole("button", { name: "Disable", exact: true }), dialog);
  await field(dialog, "Reason").fill("E2E: testing");
  await dialog.getByRole("button", { name: "Disable account" }).click();
  await expectToast(page, `${person.name} is disabled`);
  // The page says so in an alert (the history says it too).
  await expect(
    page.getByRole("alert").filter({ hasText: "Disabled until an admin enables it" }),
  ).toBeVisible();
});

When("I enable their account", async ({ page, world }) => {
  const person = someoneOf(world);
  await openTheirPage(page, person);
  await confirmOnTheirPage(page, "Enable", "Enable account");
  await expectToast(page, `${person.name} is enabled`);
});

When("I sign them out everywhere", async ({ page, world }) => {
  const person = someoneOf(world);
  await openTheirPage(page, person);
  await confirmOnTheirPage(page, "Sign out everywhere", "Sign out everywhere");
  await expectToast(page, `${person.name} is signed out everywhere`);
});

When("I require two-factor authentication of them", async ({ page, world }) => {
  await openTheirPage(page, someoneOf(world));
  await confirmOnTheirPage(page, "Require two-factor", "Require it");
  await expectToast(page, "Two-factor is required");
});

When("they sign in", async ({ world, newDevice }) => {
  const person = someoneOf(world);
  world.theirDevice = await newDevice();
  await submitSignIn(world.theirDevice, person.email, person.password);
});

When("I delete their account, typing their email address", async ({ page, world }) => {
  const person = someoneOf(world);
  await openTheirPage(page, person);
  const dialog = page.getByRole("alertdialog");
  await openDialog(page.getByRole("button", { name: "Delete", exact: true }), dialog);
  await field(dialog, `Type ${person.email} to confirm`).fill(person.email);
  await dialog.getByRole("button", { name: "Delete the account" }).click();
  await expectToast(page, `${person.name} was deleted`);
  await expect(page).toHaveURL(`${AUTH_URL}/admin/users`);
});

When("I open the users page", async ({ page }) => {
  await page.goto("/admin/users");
});

Then("they are the only one listed", async ({ page, world }) => {
  const rows = page.locator("tbody tr");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(someoneOf(world).email);
});

Then("they are told by email that their account is disabled", async ({ world, mailbox }) => {
  await mailbox.next(someoneOf(world).email, "Your account has been disabled");
});

Then("they are told their account is disabled when they sign in", async ({ world, newDevice }) => {
  const person = someoneOf(world);
  const device = await newDevice();
  await submitSignIn(device, person.email, person.password);
  await expect(device.getByText("This account is disabled.", { exact: false })).toBeVisible();
  await expect(device).toHaveURL(new RegExp(`^${AUTH_URL}/login`));
});

Then("they can sign in", async ({ world, newDevice }) => {
  const person = someoneOf(world);
  const device = await newDevice();
  await submitSignIn(device, person.email, person.password);
  await expectSignedIn(device, person.email);
});

Then("their device is signed out", async ({ world }) => {
  const device = theirDeviceOf(world);
  await device.goto("/account/security");
  await expectSignedOut(device);
});

Then("they are asked to set up two-factor authentication", async ({ world }) => {
  const device = theirDeviceOf(world);
  await expect(device).toHaveURL(`${AUTH_URL}/account/security/two-factor`);
  await expect(device.getByText("Your account requires it.", { exact: false })).toBeVisible();
});

Then("they are told by email that their account was deleted", async ({ world, mailbox }) => {
  await mailbox.next(someoneOf(world).email, "Your account has been deleted");
});

Then("they are no longer listed", async ({ page, world }) => {
  await page.goto(`/admin/users?q=${encodeURIComponent(someoneOf(world).email)}`);
  await expect(page.getByRole("heading", { name: "No one matches" })).toBeVisible();
});

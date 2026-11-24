import { expect, type Page } from "@playwright/test";
import { createAccount, newPerson } from "../support/people";
import {
  expectSignedIn,
  expectSignedOut,
  field,
  openDialog,
  openSecurityTab,
  submitAndWait,
  submitSignIn,
} from "../support/ui";
import { Given, me, Then, When, type World } from "./fixtures";

function sessions(page: Page) {
  return page.locator('[aria-labelledby="sessions-heading"]');
}

function otherDevice(world: World): Page {
  if (!world.otherDevice) throw new Error("No other device yet.");
  return world.otherDevice;
}

async function changePassword(page: Page, current: string, next: string): Promise<void> {
  await field(page, "Current password").fill(current);
  await field(page, "New password").fill(next);
  await field(page, "Type it again").fill(next);
  await submitAndWait(page, page.getByRole("button", { name: "Change password" }));
}

Given(
  "I am signed in on this device and on another device",
  async ({ page, world, mailbox, newDevice }) => {
    world.person = await createAccount(mailbox);
    const other = await newDevice();
    await submitSignIn(other, world.person.email, world.person.password);
    await expectSignedIn(other, world.person.email);
    world.otherDevice = other;
    await submitSignIn(page, world.person.email, world.person.password);
    await expectSignedIn(page, world.person.email);
  },
);

When("I change my password", async ({ page, world }) => {
  const password = newPerson().password;
  await changePassword(page, me(world).password, password);
  world.oldPassword = me(world).password;
  world.person = { ...me(world), password };
});

When("I change my password, giving a wrong current password", async ({ page, world }) => {
  await changePassword(page, `${me(world).password}-wrong`, newPerson().password);
});

When("I open the sessions on my security page", async ({ page }) => {
  await openSecurityTab(page, "Sessions");
});

When("I sign out the other device from my security page", async ({ page }) => {
  await openSecurityTab(page, "Sessions");
  // Only the other device's session has a button: this one is signed out from the menu.
  await sessions(page).getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByText(/^Signed out of /)).toBeVisible();
});

When("I sign out everywhere", async ({ page }) => {
  await openSecurityTab(page, "Sessions");
  const dialog = page.getByRole("alertdialog");
  await openDialog(page.getByRole("button", { name: "Sign out everywhere" }), dialog);
  await dialog.getByRole("button", { name: "Sign out everywhere" }).click();
});

Then("I am told my password was changed", async ({ page }) => {
  await expect(page.getByText("Password changed")).toBeVisible();
});

Then("I am still signed in on this device", async ({ page, world }) => {
  await page.goto("/account/security");
  await expectSignedIn(page, me(world).email);
});

Then("the other device is signed out", async ({ world }) => {
  const other = otherDevice(world);
  await other.goto("/account/security");
  await expectSignedOut(other);
});

Then("the list of sessions shows this device and one other", async ({ page }) => {
  await expect(sessions(page).getByText("This device")).toHaveCount(1);
  await expect(sessions(page).getByRole("button", { name: "Sign out" })).toHaveCount(1);
});

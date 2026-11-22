import { expect, type Page } from "@playwright/test";
import { linkIn, type Mailbox } from "../support/mailbox";
import { newPerson } from "../support/people";
import { expectSignedIn, field, submitSignIn } from "../support/ui";
import { Given, me, Then, When, type World } from "./fixtures";

const RESET_SUBJECT = "Reset your password";

async function askForReset(page: Page, email: string): Promise<void> {
  await page.goto("/forgot-password");
  await field(page, "Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("Check your email")).toBeVisible();
}

async function receiveResetLink(world: World, mailbox: Mailbox): Promise<string> {
  const email = await mailbox.next(me(world).email, RESET_SUBJECT);
  world.link = linkIn(email, "/api/auth/reset-password/");
  return world.link;
}

/** Opens the reset link and submits the two password fields. */
async function chooseNewPassword(page: Page, link: string, password: string, again = password) {
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  await field(page, "New password").fill(password);
  await field(page, "Type it again").fill(again);
  await page.getByRole("button", { name: "Change password" }).click();
}

Given("I have asked to reset my password", async ({ page, world, mailbox }) => {
  await askForReset(page, me(world).email);
  await receiveResetLink(world, mailbox);
});

Given("I have reset my password with the emailed link", async ({ page, world, mailbox }) => {
  await askForReset(page, me(world).email);
  const link = await receiveResetLink(world, mailbox);
  await chooseNewPassword(page, link, newPerson().password);
  await expect(page.getByText("Your password is changed")).toBeVisible();
});

When("I ask to reset my password", async ({ page, world }) => {
  await page.goto("/forgot-password");
  await field(page, "Email").fill(me(world).email);
  await page.getByRole("button", { name: "Send reset link" }).click();
});

When("I open the reset link and choose a new password", async ({ page, world }) => {
  if (!world.link) throw new Error("No reset link yet.");
  const password = newPerson().password;
  await chooseNewPassword(page, world.link, password);
  world.oldPassword = me(world).password;
  world.person = { ...me(world), password };
});

When("I open the reset link and type two different passwords", async ({ page, world }) => {
  if (!world.link) throw new Error("No reset link yet.");
  await chooseNewPassword(page, world.link, newPerson().password, newPerson().password);
});

When("I open the same reset link again", async ({ page, world }) => {
  if (!world.link) throw new Error("No reset link yet.");
  await page.goto(world.link);
});

Then("I receive a password reset link", async ({ world, mailbox }) => {
  await receiveResetLink(world, mailbox);
});

Then("no reset link is emailed to me", async ({ world, mailbox }) => {
  await mailbox.expectNone(me(world).email, RESET_SUBJECT);
});

Then("I am told my password is changed", async ({ page }) => {
  await expect(page.getByText("Your password is changed")).toBeVisible();
});

Then("my old password no longer works", async ({ page, world }) => {
  if (!world.oldPassword) throw new Error("No old password: the password wasn't changed.");
  await submitSignIn(page, me(world).email, world.oldPassword);
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
});

Then("I can sign in with my new password", async ({ page, world }) => {
  await page.goto("/login");
  await submitSignIn(page, me(world).email, me(world).password);
  await expectSignedIn(page, me(world).email);
});

Then("I am told the reset link has expired or was already used", async ({ page }) => {
  await expect(page.getByText(/link has expired or was already used/)).toBeVisible();
});

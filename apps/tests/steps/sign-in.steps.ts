import { expect, type Page } from "@playwright/test";
import { AUTH_URL } from "../support/env";
import { linkIn, type Mailbox } from "../support/mailbox";
import { createAccount } from "../support/people";
import { expectSignedIn, expectSignedOut, field, submitSignIn } from "../support/ui";
import { Given, me, Then, When, type World } from "./fixtures";

async function signOut(page: Page): Promise<void> {
  // The navigation bar's button; the list of sessions has "Sign out" buttons too.
  await page.getByRole("banner").getByRole("button", { name: "Sign out", exact: true }).click();
  await expectSignedOut(page);
}

async function askForSignInLink(page: Page, email: string): Promise<void> {
  await page.goto("/magic-link");
  await field(page, "Email").fill(email);
  await page.getByRole("button", { name: "Email me a link" }).click();
}

async function receiveSignInLink(world: World, mailbox: Mailbox): Promise<void> {
  const email = await mailbox.next(me(world).email, "Your sign-in link");
  world.link = linkIn(email, "/api/auth/magic-link/verify");
}

Given("I have signed in with a link sent by email", async ({ page, world, mailbox }) => {
  world.person = await createAccount(mailbox);
  await askForSignInLink(page, world.person.email);
  await receiveSignInLink(world, mailbox);
  await page.goto(world.link ?? "");
  await expectSignedIn(page, world.person.email);
});

Given("I have signed out", async ({ page }) => {
  await signOut(page);
});

When("I sign in with my email and a wrong password", async ({ page, world }) => {
  await submitSignIn(page, me(world).email, `${me(world).password}-wrong`);
});

When("I open my security page", async ({ page }) => {
  await page.goto("/account/security");
});

When("I sign out", async ({ page }) => {
  await signOut(page);
});

When("I ask for a sign-in link to be emailed to me", async ({ page, world }) => {
  await askForSignInLink(page, me(world).email);
});

When("I open the sign-in link", async ({ page, world }) => {
  if (!world.link) throw new Error("No sign-in link yet.");
  await page.goto(world.link);
});

When("I open the same sign-in link again", async ({ page, world }) => {
  if (!world.link) throw new Error("No sign-in link yet.");
  await page.goto(world.link);
});

Then("I receive a sign-in link", async ({ world, mailbox }) => {
  await receiveSignInLink(world, mailbox);
});

Then("I am told the email or password is incorrect", async ({ page }) => {
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
});

Then("I am still on the sign-in page", async ({ page }) => {
  await expectSignedOut(page);
});

Then("I am asked to sign in first", async ({ page }) => {
  await expectSignedOut(page);
  expect(new URL(page.url()).searchParams.get("returnTo")).toBe("/account/security");
});

Then("I am on the sign-in page", async ({ page }) => {
  await expectSignedOut(page);
});

Then("my security page asks me to sign in again", async ({ page }) => {
  await page.goto(`${AUTH_URL}/account/security`);
  await expectSignedOut(page);
});

Then("I am told the sign-in link didn't work", async ({ page }) => {
  await expect(page).toHaveURL(new RegExp(`^${AUTH_URL}/magic-link`));
  await expect(page.getByText("That link didn't work")).toBeVisible();
});

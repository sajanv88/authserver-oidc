import { expect, type Page } from "@playwright/test";
import { AUTH_URL } from "../support/env";
import { linkIn } from "../support/mailbox";
import { createUnconfirmedAccount, newPerson } from "../support/people";
import { field } from "../support/ui";
import { Given, me, Then, When } from "./fixtures";

async function signUp(page: Page, person: { name: string; email: string; password: string }) {
  await page.goto("/signup");
  await field(page, "Name").fill(person.name);
  await field(page, "Email").fill(person.email);
  await field(page, "Password").fill(person.password);
  await page.getByRole("button", { name: "Create account" }).click();
}

Given("I have signed up but not confirmed my address", async ({ world, mailbox }) => {
  world.person = await createUnconfirmedAccount(mailbox);
});

Given("I am on the sign-up page", async ({ page }) => {
  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: "Create an account" })).toBeVisible();
});

When("I sign up with my name, email and a password", async ({ page, world }) => {
  await signUp(page, me(world));
});

When("someone signs up with my email address", async ({ page, world }) => {
  await signUp(page, { ...newPerson(), email: me(world).email });
});

When("I submit the sign-up form empty", async ({ page }) => {
  await page.getByRole("button", { name: "Create account" }).click();
});

When("I open the confirmation link", async ({ page, world }) => {
  if (!world.link) throw new Error("No confirmation link yet.");
  await page.goto(world.link);
});

When("I open a confirmation link that has expired", async ({ page }) => {
  // What Better Auth does with a link past its time: back to the page that asked for it,
  // with an error. A token that doesn't verify gets the same answer.
  const callbackURL = "/verify-email?next=%2F";
  await page.goto(
    `${AUTH_URL}/api/auth/verify-email?${new URLSearchParams({ token: "expired", callbackURL })}`,
  );
});

When("I ask for a new confirmation link for my address", async ({ page, world }) => {
  await field(page, "Email").fill(me(world).email);
  await page.getByRole("button", { name: "Send a new link" }).click();
});

Then("I receive an email asking me to confirm my address", async ({ world, mailbox }) => {
  const email = await mailbox.next(me(world).email, "Confirm your email address");
  world.link = linkIn(email, "/api/auth/verify-email");
});

Then("I receive an email saying I already have an account", async ({ world, mailbox }) => {
  await mailbox.next(me(world).email, "You already have an account");
});

Then("I am told to confirm my email first", async ({ page }) => {
  await expect(page.getByText("Confirm your email first")).toBeVisible();
});

Then("I am told the link didn't work", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "That link didn't work" })).toBeVisible();
});

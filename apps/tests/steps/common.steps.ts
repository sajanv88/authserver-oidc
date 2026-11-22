import { expect } from "@playwright/test";
import { createAccount, newPerson } from "../support/people";
import { expectSignedIn, submitSignIn } from "../support/ui";
import { Given, me, Then, When } from "./fixtures";

// Steps every feature uses: who I am, signing in, and what the page says.

Given("I am a new visitor", ({ world }) => {
  world.person = newPerson();
});

Given("I have an account", async ({ world, mailbox }) => {
  world.person = await createAccount(mailbox);
});

Given("I am signed in", async ({ page, world, mailbox }) => {
  world.person = await createAccount(mailbox);
  await submitSignIn(page, world.person.email, world.person.password);
  await expectSignedIn(page, world.person.email);
});

When("I sign in with my email and password", async ({ page, world }) => {
  await submitSignIn(page, me(world).email, me(world).password);
});

Then("I am signed in to the security page", async ({ page, world }) => {
  await expectSignedIn(page, me(world).email);
});

Then("I am asked to check my email", async ({ page }) => {
  await expect(page.getByText("Check your email")).toBeVisible();
});

Then("I see {string}", async ({ page }, text: string) => {
  await expect(page.getByText(text, { exact: true })).toBeVisible();
});

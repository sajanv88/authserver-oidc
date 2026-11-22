import { expect, type Locator, type Page } from "@playwright/test";
import { AUTH_URL } from "./env";

/**
 * A form field by its accessible name. Not getByLabel: a required field's label also holds a
 * hidden "*", which the accessible name leaves out.
 */
export function field(scope: Page | Locator, name: string): Locator {
  return scope.getByRole("textbox", { name, exact: true });
}

/** Fills the sign-in form on the page (opening /login if it isn't one) and submits it. */
export async function submitSignIn(page: Page, email: string, password: string): Promise<void> {
  if (!page.url().startsWith(`${AUTH_URL}/login`)) await page.goto("/login");
  await field(page, "Email").fill(email);
  await field(page, "Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/** On the account security page, signed in as `email`. */
export async function expectSignedIn(page: Page, email: string): Promise<void> {
  await expect(page).toHaveURL(`${AUTH_URL}/account/security`);
  await expect(page.getByRole("heading", { level: 1, name: "Security" })).toBeVisible();
  await expect(page.getByText(`Signed in as ${email}.`)).toBeVisible();
}

/** On the sign-in page, with no session. */
export async function expectSignedOut(page: Page): Promise<void> {
  await expect(page).toHaveURL(new RegExp(`^${AUTH_URL}/login`));
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
}

/**
 * Presses `trigger` until `dialog` shows. Forms on these pages work before React hydrates,
 * but a dialog needs it: a click that lands first does nothing, so it's tried again.
 */
export async function openDialog(trigger: Locator, dialog: Locator): Promise<void> {
  await expect(async () => {
    await trigger.click();
    await expect(dialog).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

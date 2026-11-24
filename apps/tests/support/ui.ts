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

/**
 * On the profile page, signed in as `email`. Visible text only: Next keeps the profile pages
 * visited before in the document, hidden, and each has the same header.
 */
export async function expectSignedIn(page: Page, email: string): Promise<void> {
  await expect(page).toHaveURL(`${AUTH_URL}/account/security`);
  await expect(page.getByRole("navigation", { name: "Profile settings" })).toBeVisible();
  await expect(page.getByText(`Signed in as ${email}.`).filter({ visible: true })).toBeVisible();
}

/** On the sign-in page, with no session. */
export async function expectSignedOut(page: Page): Promise<void> {
  await expect(page).toHaveURL(new RegExp(`^${AUTH_URL}/login`));
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
}

/**
 * Presses a form's submit button and waits for the server's answer. Leaving the page before
 * it arrives cancels it in the browser after the server has acted: an answer that carries a
 * new session cookie (changing the password, turning two-factor on or off) would be lost.
 */
export async function submitAndWait(page: Page, button: Locator): Promise<void> {
  const path = new URL(page.url()).pathname;
  const answered = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" && new URL(response.url()).pathname === path,
  );
  await button.click();
  await answered;
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

/**
 * Opens the menu behind `trigger`, chooses `item`, and waits for `dialog`. Tried again like
 * openDialog; a menu left open by a try that didn't finish is closed first, since it covers
 * the page and the trigger can't be pressed through it.
 */
export async function openDialogFromMenu(
  page: Page,
  trigger: Locator,
  item: string,
  dialog: Locator,
): Promise<void> {
  const menu = page.getByRole("menu");
  await expect(async () => {
    if (await menu.isVisible()) await page.keyboard.press("Escape");
    await trigger.click();
    await menu.getByRole("menuitem", { name: item, exact: true }).click({ timeout: 2_000 });
    await expect(dialog).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

const SECURITY_TABS = {
  Password: "/account/security",
  "Two-factor": "/account/security/two-factor",
  Sessions: "/account/security/sessions",
} as const;

/** Opens a tab of the profile pages from their nav (from /account/security if elsewhere). */
export async function openSecurityTab(page: Page, tab: keyof typeof SECURITY_TABS): Promise<void> {
  if (!page.url().startsWith(`${AUTH_URL}/account/security`)) await page.goto("/account/security");
  const link = page
    .getByRole("navigation", { name: "Profile settings" })
    .getByRole("link", { name: tab, exact: true });
  await link.click();
  await expect(page).toHaveURL(`${AUTH_URL}${SECURITY_TABS[tab]}`);
  await expect(link).toHaveAttribute("aria-current", "page");
}

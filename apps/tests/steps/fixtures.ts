import type { BrowserContext, Page } from "@playwright/test";
import { test as base, createBdd } from "playwright-bdd";
import { AUTH_URL } from "../support/env";
import { Mailbox } from "../support/mailbox";
import { type Person, randomIp } from "../support/people";

/** What a scenario's steps share: who it's about, and what they've been handed so far. */
export type World = {
  /** The person the scenario is about, "I" in the steps. */
  person?: Person;
  /** The last emailed link the scenario was given. */
  link?: string;
  /** My password before I changed it. */
  oldPassword?: string;
  /** A second browser where I'm signed in too: another device. */
  otherDevice?: Page;
};

type Fixtures = {
  world: World;
  mailbox: Mailbox;
  /** Opens another browser, as another device: cookies and an address of its own. */
  newDevice: () => Promise<Page>;
};

export const test = base.extend<Fixtures>({
  // Each scenario's browser comes from an address of its own (see randomIp).
  // biome-ignore lint/correctness/noEmptyPattern: Playwright reads a fixture's dependencies from this pattern, and this one has none.
  extraHTTPHeaders: async ({}, use) => {
    await use({ "x-forwarded-for": randomIp() });
  },
  // biome-ignore lint/correctness/noEmptyPattern: as above.
  world: async ({}, use) => {
    await use({});
  },
  // biome-ignore lint/correctness/noEmptyPattern: as above.
  mailbox: async ({}, use) => {
    await use(new Mailbox());
  },
  newDevice: async ({ browser }, use) => {
    const contexts: BrowserContext[] = [];
    await use(async () => {
      const context = await browser.newContext({
        baseURL: AUTH_URL,
        extraHTTPHeaders: { "x-forwarded-for": randomIp() },
      });
      contexts.push(context);
      return context.newPage();
    });
    for (const context of contexts) await context.close();
  },
});

export const { Given, When, Then } = createBdd(test);

/** The scenario's person, set by a Given step. */
export function me(world: World): Person {
  if (!world.person) throw new Error("No person yet: start the scenario with a Given about me.");
  return world.person;
}

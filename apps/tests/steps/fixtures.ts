import { test as base, createBdd } from "playwright-bdd";
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
};

export const test = base.extend<{ world: World; mailbox: Mailbox }>({
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
});

export const { Given, When, Then } = createBdd(test);

/** The scenario's person, set by a Given step. */
export function me(world: World): Person {
  if (!world.person) throw new Error("No person yet: start the scenario with a Given about me.");
  return world.person;
}

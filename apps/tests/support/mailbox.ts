import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "@playwright/test";
import { OUTPUT_DIR } from "./env";

export type Email = { to: string; subject: string; text: string };

const LOG = join(OUTPUT_DIR, "auth-server.log");
const MARKER = '{"level":"info","msg":"email (console provider, not sent)"';

/** Every email the auth server has printed since it started (console provider). */
async function printedEmails(): Promise<Email[]> {
  const content = await readFile(LOG, "utf8").catch(() => "");
  const emails: Email[] = [];
  for (const line of content.split("\n")) {
    const start = line.indexOf(MARKER);
    if (start === -1) continue;
    try {
      const { to, subject, text } = JSON.parse(line.slice(start)) as Partial<Email>;
      if (typeof to === "string" && typeof subject === "string" && typeof text === "string") {
        emails.push({ to: to.toLowerCase(), subject, text });
      }
    } catch {
      // A line cut short while the server was still writing it: read again on the next poll.
    }
  }
  return emails;
}

/**
 * One scenario's view of the inbox. Each address in a scenario is new, so every email to it
 * is the scenario's own; `next` hands them out in order, each once.
 */
export class Mailbox {
  readonly #taken = new Map<string, number>();

  /** Waits for the next email to `to` whose subject contains `subject`. */
  async next(to: string, subject: string): Promise<Email> {
    const address = to.toLowerCase();
    let found: Email | undefined;
    await expect
      .poll(
        async () => {
          const mine = (await printedEmails()).filter((email) => email.to === address);
          const from = this.#taken.get(address) ?? 0;
          const index = mine.findIndex((email, i) => i >= from && email.subject.includes(subject));
          if (index === -1) return false;
          found = mine[index];
          this.#taken.set(address, index + 1);
          return true;
        },
        { message: `an email "${subject}" to ${address}`, timeout: 20_000 },
      )
      .toBe(true);
    if (!found) throw new Error(`No email "${subject}" to ${address}`);
    return found;
  }

  /** Checks that no email with `subject` reaches `to` for a while. */
  async expectNone(to: string, subject: string, forMs = 3_000): Promise<void> {
    const address = to.toLowerCase();
    await new Promise((resolve) => setTimeout(resolve, forMs));
    const from = this.#taken.get(address) ?? 0;
    const mine = (await printedEmails()).filter((email) => email.to === address);
    expect(mine.slice(from).filter((email) => email.subject.includes(subject))).toEqual([]);
  }
}

/** The link in an email whose address contains `path`. */
export function linkIn(email: Email, path: string): string {
  const link = email.text.match(/https?:\/\/\S+/g)?.find((url) => url.includes(path));
  if (!link) throw new Error(`No link to ${path} in "${email.subject}"`);
  return link;
}

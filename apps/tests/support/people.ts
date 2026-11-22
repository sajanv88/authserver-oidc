import { randomInt, randomUUID } from "node:crypto";
import { type APIRequestContext, expect, request } from "@playwright/test";
import { AUTH_URL } from "./env";
import { linkIn, type Mailbox } from "./mailbox";

export type Person = { name: string; email: string; password: string };

/** Someone new: a unique address on example.com (reserved, so nothing is ever delivered). */
export function newPerson(): Person {
  const id = randomUUID().slice(0, 8);
  return {
    name: `Tester ${id}`,
    email: `e2e-${id}@example.com`,
    password: `pw-${randomUUID()}`,
  };
}

/**
 * A client address of its own, sent as X-Forwarded-For. The auth server rate-limits sign-ups,
 * sign-ins and emails per IP; one address per browser keeps parallel scenarios from sharing a
 * budget, as real visitors don't.
 */
export function randomIp(): string {
  return `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
}

/** A fresh HTTP client for the auth server's public API, as a browser from its own address. */
export function authApi(): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: AUTH_URL,
    extraHTTPHeaders: { origin: AUTH_URL, "x-forwarded-for": randomIp() },
  });
}

async function signUp(api: APIRequestContext, person: Person): Promise<void> {
  const response = await api.post("/api/auth/sign-up/email", {
    data: {
      name: person.name,
      email: person.email,
      password: person.password,
      callbackURL: "/verify-email?next=%2F",
    },
  });
  expect(response.ok(), `sign-up: ${await response.text()}`).toBe(true);
}

/** Signed up, the confirmation email not opened yet. */
export async function createUnconfirmedAccount(mailbox: Mailbox): Promise<Person> {
  const person = newPerson();
  const api = await authApi();
  try {
    await signUp(api, person);
    await mailbox.next(person.email, "Confirm your email address");
  } finally {
    await api.dispose();
  }
  return person;
}

/** Signed up and confirmed through the emailed link, through the public API. Signed out. */
export async function createAccount(mailbox: Mailbox): Promise<Person> {
  const person = newPerson();
  const api = await authApi();
  try {
    await signUp(api, person);
    const email = await mailbox.next(person.email, "Confirm your email address");
    const confirmed = await api.get(linkIn(email, "/api/auth/verify-email"), { maxRedirects: 0 });
    expect(confirmed.status()).toBe(302);
    expect(confirmed.headers().location ?? "").not.toContain("error=");
  } finally {
    await api.dispose();
  }
  return person;
}

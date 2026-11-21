import { defineRelations } from "drizzle-orm";
import * as schema from "./schema";

// All relations in one place (Drizzle relations v2), for the relational queries in
// src/queries. Better Auth's adapter doesn't need them: it uses the select builder.
export const relations = defineRelations(schema, (r) => ({
  users: {
    sessions: r.many.sessions(),
    accounts: r.many.accounts(),
    twoFactors: r.many.twoFactors(),
    oauthClients: r.many.oauthClients(),
  },
  sessions: {
    user: r.one.users({ from: r.sessions.userId, to: r.users.id, optional: false }),
  },
  accounts: {
    user: r.one.users({ from: r.accounts.userId, to: r.users.id, optional: false }),
  },
  twoFactors: {
    user: r.one.users({ from: r.twoFactors.userId, to: r.users.id, optional: false }),
  },
  oauthClients: {
    owner: r.one.users({ from: r.oauthClients.userId, to: r.users.id }),
  },
}));

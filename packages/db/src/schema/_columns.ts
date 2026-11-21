import { timestamp } from "drizzle-orm/pg-core";

// Column helpers shared by the table files. Not re-exported from ./index: only tables and enums
// belong in the schema object that drizzle-kit and defineRelations read.

// A point in time, always with a time zone.
export const timestamptz = () => timestamp({ withTimezone: true, mode: "date" });

export const createdAt = () => timestamptz().notNull().defaultNow();

export const updatedAt = () =>
  timestamptz()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

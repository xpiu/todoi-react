// Todoi data model (Drizzle ORM, PostgreSQL).
// Conventions: app-generated text ids, timestamptz with defaults.
// Only the bare core exists for now; the wider model (projects, lists, labels, …) comes later.
import { pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { ITEM_STATUSES } from "../../shared/item-status";

export const itemStatusEnum = pgEnum("item_status", ITEM_STATUSES);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const items = pgTable("items", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  status: itemStatusEnum("status").notNull().default("TODO"),
  ...timestamps,
});

export type Item = typeof items.$inferSelect;

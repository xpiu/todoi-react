// A person's calendar: the dated, live items of every project they're a member of plus their Inbox, as
// one .ics document — the account's one-off download and the private live feed are the same calendar.
// The feed link carries a random secret token stored with the person's feed row ("secret address", decisions
// B6–B8, Q3): looked up by a unique-index equality, independent of BETTER_AUTH_SECRET; "Reset link" replaces it
// so the old link stops at once.
import { randomBytes } from "node:crypto";
import { and, asc, eq, inArray, isNotNull, or } from "drizzle-orm";

import { itemsToCalendar } from "../../shared/calendarExport";
import { inboxFor } from "../auth";
import { db } from "../db";
import { calendarFeeds, items } from "../db/schema";
import { env } from "../env";
import { itemIsLive } from "./lifecycle";
import { memberProjectIds } from "./projects";

/** The calendar's items: dated (a due or a start), live, in the person's projects or Inbox. */
export async function calendarItemsOf(userId: string, inboxListId: string) {
  const ids = await memberProjectIds(userId);
  return db
    .select()
    .from(items)
    .where(and(itemIsLive, or(isNotNull(items.dueDate), isNotNull(items.startDate)), or(ids.length ? inArray(items.projectId, ids) : undefined, eq(items.listId, inboxListId))))
    .orderBy(asc(items.dueDate), asc(items.id));
}

/** The person's calendar as text/calendar */
export const calendarOf = async (userId: string, inboxListId: string) => itemsToCalendar(await calendarItemsOf(userId, inboxListId), env.APP_URL);

/** A link's secret: 32 random bytes, base64url (43 characters). */
const newToken = () => randomBytes(32).toString("base64url");
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
export const feedUrl = (token: string) => `${env.APP_URL.replace(/\/$/, "")}/api/feeds/calendar/${token}.ics`;
const linkOf = (row: typeof calendarFeeds.$inferSelect) => ({ url: feedUrl(row.token), createdAt: row.updatedAt });

/** The person's current feed link, made on first use. */
export async function currentFeed(userId: string) {
  await db.insert(calendarFeeds).values({ userId, token: newToken() }).onConflictDoNothing();
  const [row] = await db.select().from(calendarFeeds).where(eq(calendarFeeds.userId, userId));
  return linkOf(row!);
}

/** A new link; the old one stops working at once. */
export async function resetFeed(userId: string) {
  const token = newToken();
  const [row] = await db
    .insert(calendarFeeds)
    .values({ userId, token })
    .onConflictDoUpdate({ target: calendarFeeds.userId, set: { token, updatedAt: new Date() } })
    .returning();
  return linkOf(row!);
}

/** The owner's calendar for a feed token, or null when the token is wrong or was reset. */
export async function feedCalendar(token: string): Promise<string | null> {
  if (!TOKEN.test(token)) return null;
  const [row] = await db.select({ userId: calendarFeeds.userId }).from(calendarFeeds).where(eq(calendarFeeds.token, token));
  if (!row) return null;
  return calendarOf(row.userId, await inboxFor(row.userId));
}

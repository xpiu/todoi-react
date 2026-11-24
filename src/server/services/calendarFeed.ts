// A person's calendar: the dated, live items of every project they're a member of plus their Inbox, as
// one .ics document — the account's one-off download and the private live feed are the same calendar.
// The feed link is `<feedId><HMAC(feedId)>`: only the id is stored, the MAC is checked in constant time,
// and "Reset link" swaps the id so the old link stops at once (decisions B6–B8).
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, asc, eq, inArray, isNotNull, or } from "drizzle-orm";
import { nanoid } from "nanoid";

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

const ID_LENGTH = 21;
const mac = (feedId: string) => createHmac("sha256", env.BETTER_AUTH_SECRET).update(`calendar-feed:${feedId}`).digest("base64url");
const TOKEN = new RegExp(`^[A-Za-z0-9_-]{${ID_LENGTH + 43}}$`);
const tokenOf = (feedId: string) => `${feedId}${mac(feedId)}`;
export const feedUrl = (feedId: string) => `${env.APP_URL.replace(/\/$/, "")}/api/feeds/calendar/${tokenOf(feedId)}.ics`;

/** The feed id a token names, if its MAC is right (compared in constant time); null otherwise. */
export function feedIdOf(token: string): string | null {
  if (!TOKEN.test(token)) return null;
  const feedId = token.slice(0, ID_LENGTH);
  const given = Buffer.from(token.slice(ID_LENGTH)), want = Buffer.from(mac(feedId));
  return given.length === want.length && timingSafeEqual(given, want) ? feedId : null;
}

/** The person's current feed link, made on first use. */
export async function currentFeed(userId: string) {
  await db.insert(calendarFeeds).values({ userId, feedId: nanoid(ID_LENGTH) }).onConflictDoNothing();
  const [row] = await db.select().from(calendarFeeds).where(eq(calendarFeeds.userId, userId));
  return { url: feedUrl(row!.feedId), createdAt: row!.updatedAt };
}

/** A new link; the old one stops working at once. */
export async function resetFeed(userId: string) {
  const feedId = nanoid(ID_LENGTH);
  const [row] = await db
    .insert(calendarFeeds)
    .values({ userId, feedId })
    .onConflictDoUpdate({ target: calendarFeeds.userId, set: { feedId, updatedAt: new Date() } })
    .returning();
  return { url: feedUrl(row!.feedId), createdAt: row!.updatedAt };
}

/** The owner's calendar for a feed token, or null when the token is wrong or was reset. */
export async function feedCalendar(token: string): Promise<string | null> {
  const feedId = feedIdOf(token);
  if (!feedId) return null;
  const [row] = await db.select({ userId: calendarFeeds.userId }).from(calendarFeeds).where(eq(calendarFeeds.feedId, feedId));
  if (!row) return null;
  return calendarOf(row.userId, await inboxFor(row.userId));
}

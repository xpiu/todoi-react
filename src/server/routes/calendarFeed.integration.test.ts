import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { describe, expect, it, vi } from "vitest";

import { db } from "../db";
import { calendarFeeds, groups, items, lists, members, projects, users } from "../db/schema";
import { app } from "../app";
import { env } from "../env";
import { calendarFeedRoute, exportRoute } from "./account";

// The signed-in routes run as `viewer`; the feed itself goes through the real app with no session at all.
const viewer = vi.hoisted(() => ({ userId: "", inboxListId: "" }));
vi.mock("../auth", async (importOriginal) => ({ ...(await importOriginal<typeof import("../auth")>()), viewerOf: () => viewer }));
const signedIn = new Hono().route("/api/me/calendar-feed", calendarFeedRoute).route("/api/me/export", exportRoute);

/** A person with a project they're a member of and an Inbox, each with dated and undated items. */
async function person(name: string) {
  const userId = nanoid(), groupId = nanoid(), projectId = nanoid(), listId = nanoid(), inbox = nanoid();
  await db.insert(users).values({ id: userId, name, email: `${userId}@example.test` });
  await db.insert(groups).values({ id: groupId, name, keyPrefix: "CF", ownerId: userId });
  await db.insert(projects).values({ id: projectId, groupId, name: `${name}'s project` });
  await db.insert(members).values({ projectId, userId, role: "owner" });
  await db.insert(lists).values([
    { id: listId, projectId, name: "To-do" },
    { id: inbox, userId, kind: "inbox", name: "Inbox" },
  ]);
  const item = async (title: string, fields: Partial<typeof items.$inferInsert> = {}) => {
    const id = nanoid();
    await db.insert(items).values({ id, title, listId, projectId, ...fields });
    return id;
  };
  await item(`${name} project item`, { dueDate: "2026-12-03" });
  await item(`${name} undated item`);
  await item(`${name} deleted item`, { dueDate: "2026-12-04", deletedAt: new Date() });
  await db.insert(items).values({ id: nanoid(), title: `${name} inbox item`, listId: inbox, startDate: "2026-12-05" });
  return { userId, inbox, projectId };
}
const as = (p: { userId: string; inbox: string }) => Object.assign(viewer, { userId: p.userId, inboxListId: p.inbox });
const link = async () => ((await (await signedIn.request("/api/me/calendar-feed")).json()) as { url: string }).url;
const pathOf = (url: string) => new URL(url).pathname;
const tokenOf = (url: string) => /([^/]+)\.ics$/.exec(url)![1]!;

describe("the private calendar feed", () => {
  it("serves the owner's calendar to anyone with the link, without a session or caching", async () => {
    const ann = await person("Ann");
    await person("Bob");
    as(ann);
    const url = await link();
    expect(url).toMatch(/\/api\/feeds\/calendar\/[A-Za-z0-9_-]{43}\.ics$/);
    // The same link on every read.
    expect(await link()).toBe(url);
    const response = await app.request(pathOf(url));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
    const ics = (await response.text()).replace(/\r\n /g, "");
    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/);
    // Only what the owner sees: their project and Inbox, dated and live; never another person's items.
    expect(ics).toContain("SUMMARY:Ann project item");
    expect(ics).toContain("SUMMARY:Ann inbox item");
    expect(ics).not.toContain("undated item");
    expect(ics).not.toContain("deleted item");
    expect(ics).not.toContain("Bob");
    // The one-off download is the same calendar.
    const download = await signedIn.request("/api/me/export/calendar");
    expect((await download.text()).replace(/\r\n /g, "").replace(/DTSTAMP:\S+/g, "")).toBe(ics.replace(/DTSTAMP:\S+/g, ""));
  });

  it("follows project membership: a project shared with the owner joins the feed", async () => {
    const ann = await person("Ann");
    const bob = await person("Bob");
    await db.insert(members).values({ projectId: bob.projectId, userId: ann.userId, role: "viewer" });
    as(ann);
    const ics = await (await app.request(pathOf(await link()))).text();
    expect(ics).toContain("SUMMARY:Bob project item");
    expect(ics).not.toContain("Bob inbox item");
  });

  it("answers 404 to a wrong, malformed or reset link, and the new link works at once", async () => {
    const ann = await person("Ann");
    as(ann);
    const url = await link();
    const path = pathOf(url);
    const token = tokenOf(url);
    const flipped = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    const wellFormed = randomBytes(32).toString("base64url");
    for (const bad of [path.replace(token, flipped), path.replace(token, wellFormed), path.replace(".ics", ""), "/api/feeds/calendar/short.ics", path.replace(token, token.slice(0, 21))]) {
      expect((await app.request(bad)).status, bad).toBe(404);
    }
    const reset = await signedIn.request("/api/me/calendar-feed/reset", { method: "POST" });
    expect(reset.status).toBe(200);
    const next = ((await reset.json()) as { url: string }).url;
    expect(next).not.toBe(url);
    expect((await app.request(path)).status).toBe(404);
    expect((await app.request(pathOf(next))).status).toBe(200);
    expect(await link()).toBe(next);
  });

  it("keeps the token as a stored random secret: unique per person and independent of the auth secret", async () => {
    const ann = await person("Ann");
    const bob = await person("Bob");
    as(ann);
    const annUrl = await link();
    // The link's token is exactly the stored row's token (a "secret address", shown again on every read).
    const [row] = await db.select().from(calendarFeeds).where(eq(calendarFeeds.userId, ann.userId));
    expect(row!.token).toBe(tokenOf(annUrl));
    as(bob);
    expect(tokenOf(await link())).not.toBe(tokenOf(annUrl));
    // Rotating BETTER_AUTH_SECRET changes neither the link nor whether it works.
    const secret = env.BETTER_AUTH_SECRET;
    try {
      Object.assign(env, { BETTER_AUTH_SECRET: randomBytes(32).toString("hex") });
      as(ann);
      expect(await link()).toBe(annUrl);
      expect((await app.request(pathOf(annUrl))).status).toBe(200);
    } finally {
      Object.assign(env, { BETTER_AUTH_SECRET: secret });
    }
  });
});

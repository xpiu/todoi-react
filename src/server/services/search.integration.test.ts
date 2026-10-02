import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";

import { db } from "../db";
import { groups, items, lists, members, projects, users } from "../db/schema";
import { searchItems } from "./search";

/** A member project, someone else's public project, and two Inboxes, all with a "Rotor" item. */
async function fixture() {
  const me = nanoid(), other = nanoid();
  await db.insert(users).values([
    { id: me, name: "Me", email: `${me}@example.test` },
    { id: other, name: "Other", email: `${other}@example.test` },
  ]);
  const group = nanoid(), otherGroup = nanoid(), mine = nanoid(), theirs = nanoid();
  await db.insert(groups).values([
    { id: group, name: "Mine", keyPrefix: "SRCH", ownerId: me },
    { id: otherGroup, name: "Theirs", keyPrefix: "OTH", ownerId: other },
  ]);
  await db.insert(projects).values([
    { id: mine, groupId: group, name: "Rotor shop" },
    { id: theirs, groupId: otherGroup, name: "Public rotors", visibility: "public" },
  ]);
  const list = nanoid(), theirList = nanoid(), inbox = nanoid(), theirInbox = nanoid();
  await db.insert(lists).values([
    { id: list, projectId: mine, name: "Doing" },
    { id: theirList, projectId: theirs, name: "Theirs" },
    { id: inbox, kind: "inbox", userId: me, name: "Inbox" },
    { id: theirInbox, kind: "inbox", userId: other, name: "Inbox" },
  ]);
  await db.insert(members).values([
    { projectId: mine, userId: me, role: "viewer" },
    { projectId: theirs, userId: other, role: "owner" },
  ]);
  const parent = nanoid(), sub = nanoid(), filed = nanoid(), captured = nanoid(), archived = nanoid(), foreign = nanoid(), foreignInbox = nanoid();
  await db.insert(items).values([
    { id: parent, projectId: mine, listId: list, title: "Inspect rotor blades", keyNumber: 7 },
    { id: sub, projectId: mine, listId: list, parentItemId: parent, title: "Order rotor 100% spares", keyNumber: 8 },
    { id: filed, projectId: mine, listId: list, title: "Unrelated paint job", keyNumber: 115 },
    { id: captured, listId: inbox, title: "Rotor idea from the hangar" },
    { id: archived, projectId: mine, listId: list, title: "Old rotor note", keyNumber: 9, archivedAt: new Date() },
    { id: foreign, projectId: theirs, listId: theirList, title: "Their rotor", keyNumber: 1 },
    { id: foreignInbox, listId: theirInbox, title: "Their rotor inbox" },
  ]);
  return { me: { userId: me, inboxListId: inbox }, mine, parent, sub, filed, captured, archived };
}

describe("item search", () => {
  it("finds the viewer's own items by title, with subitems and Inbox, and nothing else", async () => {
    const f = await fixture();
    const hits = await searchItems(f.me, "rotor");
    expect(hits.map((h) => h.id).sort()).toEqual([f.parent, f.sub, f.captured].sort());
    expect(hits.find((h) => h.id === f.sub)).toMatchObject({ parentItemId: f.parent, parentTitle: "Inspect rotor blades", keyPrefix: "SRCH", keyNumber: 8, projectId: f.mine, projectName: "Rotor shop", listName: "Doing" });
    expect(hits.find((h) => h.id === f.captured)).toMatchObject({ projectId: null, keyPrefix: null, listName: "Inbox" });
  });

  it("matches keys exactly, bare numbers, and treats LIKE wildcards literally", async () => {
    const f = await fixture();
    expect((await searchItems(f.me, "srch-115")).map((h) => h.id)).toEqual([f.filed]);
    expect((await searchItems(f.me, "115"))[0]?.id).toBe(f.filed);
    expect((await searchItems(f.me, "OTH-1")).map((h) => h.id)).toEqual([]);
    expect((await searchItems(f.me, "100%")).map((h) => h.id)).toEqual([f.sub]);
    expect((await searchItems(f.me, "%")).map((h) => h.id)).toEqual([f.sub]);
    expect(await searchItems(f.me, "_")).toEqual([]);
    expect(await searchItems(f.me, "   ")).toEqual([]);
  });

  it("drops archived projects and respects the limit", async () => {
    const f = await fixture();
    expect(await searchItems(f.me, "rotor", 1)).toHaveLength(1);
    await db.update(projects).set({ archivedAt: new Date() }).where(eq(projects.id, f.mine));
    expect((await searchItems(f.me, "rotor")).map((h) => h.id)).toEqual([f.captured]);
  });
});

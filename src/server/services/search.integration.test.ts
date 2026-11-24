import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";

import { db } from "../db";
import { comments, groups, itemAssignees, items, lists, members, projects, users } from "../db/schema";
import { fullSearch, searchItems, searchPeople } from "./search";

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

/** The Search page's world: two member projects, someone else's public project, an archived project, comments. */
async function pageFixture() {
  const me = nanoid(), other = nanoid(), gone = nanoid();
  await db.insert(users).values([
    { id: me, name: "Me", email: `${me}@example.test` },
    { id: other, name: "Other", email: `${other}@example.test` },
    { id: gone, name: "Former Member", email: `${gone}@example.test` },
  ]);
  const group = nanoid(), otherGroup = nanoid();
  await db.insert(groups).values([
    { id: group, name: "Mine", keyPrefix: "FT", ownerId: me },
    { id: otherGroup, name: "Theirs", keyPrefix: "OTF", ownerId: other },
  ]);
  const shop = nanoid(), hangar = nanoid(), shelved = nanoid(), theirs = nanoid();
  await db.insert(projects).values([
    { id: shop, groupId: group, name: "Shop" },
    { id: hangar, groupId: group, name: "Hangar" },
    { id: shelved, groupId: group, name: "Shelved", archivedAt: new Date() },
    { id: theirs, groupId: otherGroup, name: "Public", visibility: "public" },
  ]);
  const shopList = nanoid(), hangarList = nanoid(), shelvedList = nanoid(), theirList = nanoid(), inbox = nanoid(), theirInbox = nanoid();
  await db.insert(lists).values([
    { id: shopList, projectId: shop, name: "Doing" },
    { id: hangarList, projectId: hangar, name: "Bay" },
    { id: shelvedList, projectId: shelved, name: "Old" },
    { id: theirList, projectId: theirs, name: "Theirs" },
    { id: inbox, kind: "inbox", userId: me, name: "Inbox" },
    { id: theirInbox, kind: "inbox", userId: other, name: "Inbox" },
  ]);
  await db.insert(members).values([
    { projectId: shop, userId: me, role: "owner" },
    { projectId: hangar, userId: me, role: "viewer" },
    { projectId: shelved, userId: me, role: "owner" },
    { projectId: theirs, userId: other, role: "owner" },
  ]);
  const day = (n: number) => new Date(Date.UTC(2026, 0, n));
  const f = {
    me: { userId: me, inboxListId: inbox }, other: { userId: other, inboxListId: theirInbox }, shop, shopList, hangar, theirs,
    olderTitle: nanoid(), newerTitle: nanoid(), described: nanoid(), commented: nanoid(), sub: nanoid(), captured: nanoid(),
    archived: nanoid(), shelvedItem: nanoid(), trashed: nanoid(), foreign: nanoid(),
  };
  await db.insert(items).values([
    { id: f.olderTitle, projectId: shop, listId: shopList, title: "Rotor balance", keyNumber: 1, updatedAt: day(1), status: "DOING" },
    { id: f.newerTitle, projectId: shop, listId: shopList, title: "Check rotor", keyNumber: 2, updatedAt: day(2), done: true },
    { id: f.described, projectId: hangar, listId: hangarList, title: "Paint job", keyNumber: 3, updatedAt: day(9), description: "First sand the frame.\n\nThen the rotor blades need a coat." },
    { id: f.commented, projectId: shop, listId: shopList, title: "Spare parts", keyNumber: 4, updatedAt: day(9) },
    { id: f.sub, projectId: shop, listId: shopList, parentItemId: f.olderTitle, title: "Order rotors", keyNumber: 5, updatedAt: day(0) },
    { id: f.captured, listId: inbox, title: "Idea", description: "A rotor stand for the hangar", updatedAt: day(1) },
    { id: f.archived, projectId: shop, listId: shopList, title: "Old rotor note", keyNumber: 6, archivedAt: new Date() },
    { id: f.shelvedItem, projectId: shelved, listId: shelvedList, title: "Shelved rotor", keyNumber: 7 },
    { id: f.trashed, projectId: shop, listId: shopList, title: "Trashed rotor", keyNumber: 8, deletedAt: new Date() },
    { id: f.foreign, projectId: theirs, listId: theirList, title: "Their rotor", keyNumber: 1, description: "rotor rotor" },
  ]);
  await db.insert(itemAssignees).values([{ itemId: f.olderTitle, userId: me }]);
  await db.insert(comments).values([
    { id: nanoid(), itemId: f.commented, authorId: gone, body: "The new rotor hub arrived on Tuesday, after a long wait at customs." },
    { id: nanoid(), itemId: f.commented, authorId: me, body: "Unrelated note" },
    { id: nanoid(), itemId: f.foreign, authorId: other, body: "rotor comment nobody else may read" },
  ]);
  return f;
}

const ids = (r: { hits: Array<{ id: string }> }) => r.hits.map((h) => h.id);

describe("full search (Search page)", () => {
  it("ranks title over description over comments, ties by the most recently updated", async () => {
    const f = await pageFixture();
    const r = await fullSearch(f.me, "rotor");
    // Titles (newest first; "rotors" matches as a prefix), then descriptions (newest first), then the comment.
    expect(ids(r)).toEqual([f.newerTitle, f.olderTitle, f.sub, f.described, f.captured, f.commented]);
    expect(r.total).toBe(6);
    expect(r.hits[0]).toMatchObject({ match: { field: "title" }, done: true, archived: false, keyPrefix: "FT", keyNumber: 2, projectName: "Shop", listName: "Doing" });
    expect(r.hits.find((h) => h.id === f.sub)).toMatchObject({ parentItemId: f.olderTitle, parentTitle: "Rotor balance" });
  });

  it("says where it matched: description text, and the comment with its author's stored name", async () => {
    const f = await pageFixture();
    const r = await fullSearch(f.me, "rotor bla");
    expect(ids(r)).toEqual([f.described]);
    expect(r.hits[0]?.match).toEqual({ field: "description", text: "First sand the frame.\n\nThen the rotor blades need a coat." });
    const c = await fullSearch(f.me, "hub arrived");
    expect(ids(c)).toEqual([f.commented]);
    expect(c.hits[0]?.match).toEqual({ field: "comment", text: "The new rotor hub arrived on Tuesday, after a long wait at customs.", author: "Former Member" });
    expect(c.hits[0]?.projectName).toBe("Shop");
  });

  it("matches the last word as a prefix from two characters, keys exactly, and treats tsquery syntax literally", async () => {
    const f = await pageFixture();
    expect(ids(await fullSearch(f.me, "cust"))).toEqual([f.commented]);
    expect(ids(await fullSearch(f.me, "ro"))).toContain(f.olderTitle);
    expect(await fullSearch(f.me, "r")).toEqual({ hits: [], total: 0 });
    expect(await fullSearch(f.me, "   ")).toEqual({ hits: [], total: 0 });
    expect(ids(await fullSearch(f.me, "FT-3"))).toEqual([f.described]);
    for (const q of ["rotor & !x", "rot'or", "a:* | b", "\\\\", "(rotor", "--"]) await expect(fullSearch(f.me, q)).resolves.toBeDefined();
  });

  it("filters by project, status, assignee and unassigned, together", async () => {
    const f = await pageFixture();
    expect(ids(await fullSearch(f.me, "rotor", { projectId: f.hangar }))).toEqual([f.described]);
    expect(ids(await fullSearch(f.me, "rotor", { status: "DOING" }))).toEqual([f.olderTitle]);
    // A checked item without a Status shows Done, so it filters as Done.
    expect(ids(await fullSearch(f.me, "rotor", { status: "DONE" }))).toEqual([f.newerTitle]);
    expect(ids(await fullSearch(f.me, "rotor", { assignee: f.me.userId }))).toEqual([f.olderTitle]);
    expect(ids(await fullSearch(f.me, "rotor", { assignee: "none", projectId: f.shop }))).toEqual([f.newerTitle, f.sub, f.commented]);
  });

  it("leaves archived items out unless asked, and never searches the Trash", async () => {
    const f = await pageFixture();
    expect(ids(await fullSearch(f.me, "rotor"))).not.toContain(f.archived);
    const r = await fullSearch(f.me, "rotor", { archived: true });
    expect(r.total).toBe(8);
    expect(r.hits.filter((h) => h.archived).map((h) => h.id).sort()).toEqual([f.archived, f.shelvedItem].sort());
    expect(ids(r)).not.toContain(f.trashed);
  });

  it("pages with offset and limit beyond the first 20, keeping the total", async () => {
    const f = await pageFixture();
    await db.insert(items).values(Array.from({ length: 25 }, (_, i) => ({ id: nanoid(), projectId: f.shop, listId: f.shopList, title: `Widget ${i}`, keyNumber: 100 + i })));
    const first = await fullSearch(f.me, "widget");
    expect(first.hits).toHaveLength(20);
    expect(first.total).toBe(25);
    const next = await fullSearch(f.me, "widget", {}, 20);
    expect(next.hits).toHaveLength(5);
    expect(next.total).toBe(25);
    expect(new Set([...ids(first), ...ids(next)]).size).toBe(25);
    expect(await fullSearch(f.me, "widget", {}, 40)).toEqual({ hits: [], total: 25 });
  });

  it("never returns another person's project items, even public ones or by project filter", async () => {
    const f = await pageFixture();
    expect(ids(await fullSearch(f.me, "rotor", { archived: true }))).not.toContain(f.foreign);
    expect(await fullSearch(f.me, "rotor", { projectId: f.theirs })).toEqual({ hits: [], total: 0 });
    expect(await fullSearch(f.me, "nobody")).toEqual({ hits: [], total: 0 });
    // And the other person sees only their own: none of mine, not my Inbox.
    expect(ids(await fullSearch(f.other, "rotor", { archived: true }))).toEqual([f.foreign]);
  });

  it("offers the people of the viewer's own projects for the Assignee filter", async () => {
    const f = await pageFixture();
    await db.insert(members).values({ projectId: f.hangar, userId: f.other.userId, role: "editor" });
    expect((await searchPeople(f.me)).map((p) => p.name)).toEqual(["Me", "Other"]);
    // The shared project is all they have in common; the comment author who is no member is offered to no one.
    expect((await searchPeople(f.other)).map((p) => p.name)).toEqual(["Me", "Other"]);
  });
});

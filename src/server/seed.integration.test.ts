import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { expect, it } from "vitest";

import { DEV_USER, GATE_USER } from "../shared/devUser";
import { db } from "./db";
import { comments, groups, itemAssignees, items, lists, members, projects, users } from "./db/schema";
import { resetGateWorkspace, seedIfEmpty } from "./seed";

const idOf = async (email: string) => (await db.select({ id: users.id }).from(users).where(eq(users.email, email)))[0]!.id;
const nameOf = async (id: string) => (await db.select({ name: users.name }).from(users).where(eq(users.id, id)))[0]?.name;

/** What the screens show of an account's workspace, by name (ids differ between copies) */
async function workspace(email: string) {
  const owner = await idOf(email);
  const own = await db.select({ id: groups.id, name: groups.name, keyPrefix: groups.keyPrefix }).from(groups).where(eq(groups.ownerId, owner)).orderBy(asc(groups.position));
  const ps = own.length ? await db.select().from(projects).where(and(inArray(projects.groupId, own.map((g) => g.id)), isNull(projects.deletedAt))).orderBy(asc(projects.position)) : [];
  const ids = ps.map((p) => p.id);
  const listRows = ids.length ? await db.select().from(lists).where(inArray(lists.projectId, ids)).orderBy(asc(lists.position)) : [];
  const itemRows = ids.length ? await db.select().from(items).where(inArray(items.projectId, ids)).orderBy(asc(items.keyNumber)) : [];
  const people = async (rows: Array<{ userId: string }>) => Promise.all(rows.map((r) => nameOf(r.userId)));
  return {
    groups: own.map((g) => `${g.name} ${g.keyPrefix}`),
    projects: await Promise.all(ps.map(async (p) => ({ group: own.find((g) => g.id === p.groupId)!.name, name: p.name, icon: p.icon, color: p.color, members: await people(await db.select().from(members).where(eq(members.projectId, p.id))) }))),
    items: await Promise.all(itemRows.map(async (i) => ({
      key: i.keyNumber,
      list: listRows.find((l) => l.id === i.listId)!.name,
      position: i.position,
      done: i.done,
      assignees: (await people(await db.select().from(itemAssignees).where(eq(itemAssignees.itemId, i.id)))).sort(),
      comments: await Promise.all((await db.select().from(comments).where(eq(comments.itemId, i.id))).map((c) => nameOf(c.authorId))),
    }))),
    inbox: (await db.select({ title: items.title, unread: items.unread }).from(items).innerJoin(lists, eq(lists.id, items.listId)).where(and(eq(lists.userId, owner), isNull(items.parentItemId))).orderBy(asc(items.position))),
    prefs: (await db.select({ prefs: users.prefs }).from(users).where(eq(users.id, owner)))[0]!.prefs,
  };
}

it("gives the screenshot gates the dev account's sample as seeded, and puts it back after edits without touching the dev account", async () => {
  await seedIfEmpty();
  const devSeeded = await workspace(DEV_USER.email);
  expect([devSeeded.projects.length, devSeeded.items.length, devSeeded.inbox.length]).toEqual([5, 36, 7]);
  await resetGateWorkspace();
  expect(await workspace(GATE_USER.email)).toEqual(devSeeded);

  // The kind of drift hand testing leaves: a moved item, an extra project, a changed preference.
  const gate = await idOf(GATE_USER.email);
  const [main] = await db.select().from(projects).innerJoin(groups, eq(groups.id, projects.groupId)).where(and(eq(groups.ownerId, gate), eq(projects.name, "Helicopters Europe website")));
  const [fresh] = await db.select().from(lists).where(and(eq(lists.projectId, main!.projects.id), eq(lists.name, "New")));
  await db.update(items).set({ listId: fresh!.id, position: 1 }).where(and(eq(items.projectId, main!.projects.id), eq(items.keyNumber, 131)));
  await db.insert(projects).values({ id: nanoid(), groupId: main!.groups.id, name: "to do" });
  await db.update(users).set({ prefs: { showCompleted: false } }).where(eq(users.id, gate));
  expect(await workspace(GATE_USER.email)).not.toEqual(devSeeded);

  await resetGateWorkspace();
  expect(await workspace(GATE_USER.email)).toEqual(devSeeded);
  expect(await workspace(DEV_USER.email)).toEqual(devSeeded);
});

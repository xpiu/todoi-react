import { asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";

import { db } from "../db";
import { groups, items, lists, projects, users } from "../db/schema";
import { moveProjectToGroup } from "./projects";

/** A project in group A (keys A-1…A-3, one archived, one in Trash) and a sibling project in group B that already uses B-1…B-4. */
async function fixture() {
  const owner = nanoid();
  await db.insert(users).values({ id: owner, name: "Owner", email: `${owner}@example.test` });
  const ga = nanoid(), gb = nanoid(), moving = nanoid(), sibling = nanoid(), la = nanoid(), lb = nanoid();
  await db.insert(groups).values([
    { id: ga, name: "A", keyPrefix: "AAA", ownerId: owner, nextItemNumber: 4 },
    { id: gb, name: "B", keyPrefix: "BBB", ownerId: owner, nextItemNumber: 5 },
  ]);
  await db.insert(projects).values([
    { id: moving, groupId: ga, name: "Moving", position: 0 },
    { id: sibling, groupId: gb, name: "Sibling", position: 0 },
  ]);
  await db.insert(lists).values([
    { id: la, projectId: moving, name: "Todo" },
    { id: lb, projectId: sibling, name: "Todo" },
  ]);
  const [one, two, three] = [nanoid(), nanoid(), nanoid()];
  await db.insert(items).values([
    // Numbers 1–3 collide with the sibling's B-1…B-3 once the project sits in B
    { id: one, projectId: moving, listId: la, title: "One", keyNumber: 1 },
    { id: two, projectId: moving, listId: la, title: "Two", keyNumber: 2, archivedAt: new Date() },
    { id: three, projectId: moving, listId: la, title: "Three", keyNumber: 3, deletedAt: new Date() },
    ...[1, 2, 3, 4].map((n) => ({ id: nanoid(), projectId: sibling, listId: lb, title: `B-${n}`, keyNumber: n })),
  ]);
  return { ga, gb, moving, sibling, one, two, three };
}

const keysOf = async (projectId: string) => (await db.select({ id: items.id, n: items.keyNumber }).from(items).where(eq(items.projectId, projectId)).orderBy(asc(items.keyNumber))).map((r) => [r.id, r.n]);

describe("moveProjectToGroup", () => {
  it("reissues every key from the destination's counter, in the old order, and puts the project last", async () => {
    const f = await fixture();
    const result = await moveProjectToGroup(f.moving, f.gb);
    expect(result?.project).toMatchObject({ groupId: f.gb, position: 1 });
    expect(result?.rekeyed).toBe(3);
    expect(await keysOf(f.moving)).toEqual([[f.one, 5], [f.two, 6], [f.three, 7]]);
    expect((await db.select().from(groups).where(eq(groups.id, f.gb)))[0]?.nextItemNumber).toBe(8);
    expect(result?.restore).toEqual({ groupId: f.ga, keys: [{ itemId: f.one, keyNumber: 1 }, { itemId: f.two, keyNumber: 2 }, { itemId: f.three, keyNumber: 3 }] });
  });

  it("hands the old numbers back on Undo, without reissuing them", async () => {
    const f = await fixture();
    const there = await moveProjectToGroup(f.moving, f.gb);
    const back = await moveProjectToGroup(f.moving, there!.restore.groupId, there!.restore.keys);
    expect(back?.project.groupId).toBe(f.ga);
    expect(await keysOf(f.moving)).toEqual([[f.one, 1], [f.two, 2], [f.three, 3]]);
    // Group A's counter did not move: nothing new was issued there
    expect((await db.select().from(groups).where(eq(groups.id, f.ga)))[0]?.nextItemNumber).toBe(4);
  });

  it("never hands back a number another project in the group uses, nor one the group never issued", async () => {
    const f = await fixture();
    // B-1 belongs to the sibling; B-99 was never issued in B
    const result = await moveProjectToGroup(f.moving, f.gb, [{ itemId: f.one, keyNumber: 1 }, { itemId: f.two, keyNumber: 99 }]);
    const keys = Object.fromEntries(await keysOf(f.moving));
    expect(keys[f.one]).not.toBe(1);
    expect(keys[f.two]).not.toBe(99);
    expect(new Set(Object.values(keys)).size).toBe(3);
    expect(result?.rekeyed).toBe(3);
  });

  it("leaves a project already in the group as it is", async () => {
    const f = await fixture();
    const result = await moveProjectToGroup(f.moving, f.ga);
    expect(result?.rekeyed).toBe(0);
    expect(await keysOf(f.moving)).toEqual([[f.one, 1], [f.two, 2], [f.three, 3]]);
  });
});

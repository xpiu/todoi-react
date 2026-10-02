import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { describe, expect, it, vi } from "vitest";

import { db } from "../db";
import { groups, items, lists, projects, users } from "../db/schema";
import { itemsRoute } from "./items";

const viewer = vi.hoisted(() => ({ userId: "", inboxListId: "" }));
vi.mock("../auth", () => ({ viewerOf: () => viewer, maybeViewer: () => viewer }));
const app = new Hono().route("/api/items", itemsRoute);

async function fixture() {
  const userId = nanoid(), groupId = nanoid(), projectId = nanoid(), todo = nanoid(), done = nanoid(), inbox = nanoid();
  await db.insert(users).values({ id: userId, name: "Quick add", email: `${userId}@example.test` });
  await db.insert(groups).values({ id: groupId, name: "Test", keyPrefix: "QA", ownerId: userId });
  await db.insert(projects).values({ id: projectId, groupId, name: "Quick add" });
  await db.insert(lists).values([
    { id: todo, projectId, name: "To-do", statusRole: "TODO" },
    { id: done, projectId, name: "Done", statusRole: "DONE", position: 1 },
    { id: inbox, userId, kind: "inbox", name: "Inbox" },
  ]);
  Object.assign(viewer, { userId, inboxListId: inbox });
  return { todo, done, inbox };
}

const add = async (title: string, body: Record<string, unknown> = {}) => {
  const response = await app.request("/api/items", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: nanoid(), title, ...body }) });
  expect(response.status).toBe(201);
  return (await response.json()) as { id: string; position: number; status: string | null; done: boolean };
};
const order = async (listId: string) => (await db.select({ title: items.title, position: items.position }).from(items).where(eq(items.listId, listId)).orderBy(asc(items.position))).map((r) => `${r.title}@${r.position}`);

describe("creating items", () => {
  it("honors top and bottom in empty and populated lists", async () => {
    const f = await fixture();
    await add("first", { listId: f.todo, position: "top" });
    await add("second", { listId: f.todo });
    await add("third", { listId: f.todo, position: "top" });
    await add("fourth", { listId: f.todo, position: "bottom" });
    expect(await order(f.todo)).toEqual(["third@0", "first@1", "second@2", "fourth@3"]);
    expect(await add("inbox top", { position: "top" })).toMatchObject({ position: 0 });
    await add("inbox below");
    await add("inbox new top", { position: "top" });
    expect(await order(f.inbox)).toEqual(["inbox new top@0", "inbox top@1", "inbox below@2"]);
  });

  it("takes the Status from the list's role", async () => {
    const f = await fixture();
    expect(await add("in done", { listId: f.done, position: "top" })).toMatchObject({ status: "DONE", done: true, position: 0 });
    expect(await add("given status", { listId: f.done, status: "DOING" })).toMatchObject({ status: "DOING", done: false });
  });

  it("gives simultaneous additions their own places", async () => {
    const f = await fixture();
    await add("existing", { listId: f.todo });
    await Promise.all(Array.from({ length: 5 }, (_, i) => add(`top ${i}`, { listId: f.todo, position: "top" })));
    await Promise.all(Array.from({ length: 3 }, (_, i) => add(`end ${i}`, { listId: f.todo })));
    const positions = (await order(f.todo)).map((r) => Number(r.split("@")[1]));
    expect(positions).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect((await order(f.todo))[5]).toBe("existing@5");
  });
});

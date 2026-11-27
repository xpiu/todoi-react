// Project links (README › Links): every project gets a short public id, a link's slug finds its project
// under the project's read rule, and a link's item key finds the item even when it is no longer on screen.
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { beforeAll, describe, expect, it } from "vitest";

import { call, signUp, type Person } from "../../../tests/integration/accounts";
import { isProjectSlug } from "../../shared/projectLinks";
import { db } from "../db";
import { groups, items, lists, projects } from "../db/schema";

let owner: Person, stranger: Person;
let groupId: string;
beforeAll(async () => {
  [owner, stranger] = await Promise.all([signUp("Owner"), signUp("Stranger")]);
  groupId = nanoid();
  expect((await call("/api/groups", { cookie: owner.cookie, json: { id: groupId, name: "Links", keyPrefix: "LK" } })).status).toBe(201);
});

async function project(name: string, visibility?: "public") {
  const res = await call("/api/projects", { cookie: owner.cookie, json: { id: nanoid(), groupId, name, visibility, lists: [["To-do", "TODO"]] } });
  expect(res.status).toBe(201);
  const made = (await res.json()) as { project: { id: string; slug: string }; lists: Array<{ id: string }> };
  return { ...made.project, listId: made.lists[0]!.id };
}
async function item(p: { listId: string }, title: string) {
  const res = await call("/api/items", { cookie: owner.cookie, json: { id: nanoid(), listId: p.listId, title } });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string; keyNumber: number };
}

describe("project slugs", () => {
  it("are made for every new project, by the API and by a plain insert alike", async () => {
    const made = await project("Made by the API");
    expect(isProjectSlug(made.slug)).toBe(true);
    const id = nanoid();
    const [row] = await db.insert(projects).values({ id, groupId, name: "Inserted" }).returning({ slug: projects.slug });
    expect(isProjectSlug(row!.slug)).toBe(true);
    expect(row!.slug).not.toBe(made.slug);
    // 200 at once stay distinct and well formed.
    const many = await db.insert(projects).values(Array.from({ length: 200 }, (_, i) => ({ id: nanoid(), groupId, name: `Bulk ${i}`, deletedAt: new Date() }))).returning({ slug: projects.slug });
    expect(new Set(many.map((m) => m.slug)).size).toBe(200);
    expect(many.every((m) => isProjectSlug(m.slug))).toBe(true);
  });

  it("travel with the sidebar and the project, and never change on an update", async () => {
    const made = await project("Renamed later");
    const sidebar = (await (await call("/api/groups", { cookie: owner.cookie })).json()) as Array<{ projects: Array<{ id: string; slug: string }> }>;
    expect(sidebar.flatMap((g) => g.projects).find((p) => p.id === made.id)?.slug).toBe(made.slug);
    // `slug` is not an updatable field: the request is refused or ignored, never applied.
    await call(`/api/projects/${made.id}`, { method: "PATCH", cookie: owner.cookie, json: { name: "Renamed", slug: "aaaaaaaaa2" } });
    const detail = (await (await call(`/api/projects/${made.id}`, { cookie: owner.cookie })).json()) as { name: string; slug: string };
    expect(detail).toMatchObject({ name: "Renamed", slug: made.slug });
  });

  it("find their project for those who may read it", async () => {
    const priv = await project("Private");
    const pub = await project("Public", "public");
    expect(await (await call(`/api/projects?slug=${priv.slug}`, { cookie: owner.cookie })).json()).toEqual({ id: priv.id, slug: priv.slug });
    expect((await call(`/api/projects?slug=${priv.slug}`, { cookie: stranger.cookie })).status).toBe(403);
    expect(await (await call(`/api/projects?slug=${pub.slug}`, { cookie: stranger.cookie })).json()).toEqual({ id: pub.id, slug: pub.slug });
    // A well-formed slug nobody has, and things that are not slugs at all.
    expect((await call("/api/projects?slug=aaaaaaaaa2", { cookie: owner.cookie })).status).toBe(404);
    for (const slug of ["inbox", priv.id, "EPD5VJXY38"]) expect((await call(`/api/projects?slug=${slug}`, { cookie: owner.cookie })).status).toBeGreaterThanOrEqual(400);
    expect((await call("/api/projects", { cookie: owner.cookie })).status).toBe(400);
  });
});

describe("item keys in links", () => {
  it("find the item in its project, archived or moved within the group, and nothing across groups", async () => {
    const a = await project("A");
    const b = await project("B");
    const first = await item(a, "First");
    const key = `LK-${first.keyNumber}`;
    const find = (projectId: string, k: string, cookie = owner.cookie) => call(`/api/projects/${projectId}/items/${k}`, { cookie });
    expect(await (await find(a.id, key)).json()).toEqual({ id: first.id });
    // Lower case and another prefix name the same item: numbers are unique within a project.
    expect(await (await find(a.id, key.toLowerCase())).json()).toEqual({ id: first.id });
    expect(await (await find(a.id, `OLD-${first.keyNumber}`)).json()).toEqual({ id: first.id });
    // Archived: still found, so the link can say so.
    await db.update(items).set({ archivedAt: new Date() }).where(eq(items.id, first.id));
    expect(await (await find(a.id, key)).json()).toEqual({ id: first.id });
    // Moved to another project of the group: its old link still finds it.
    await db.update(items).set({ archivedAt: null, projectId: b.id, listId: b.listId }).where(eq(items.id, first.id));
    expect(await (await find(a.id, key)).json()).toEqual({ id: first.id });
    // Unknown numbers, ids and nonsense name nothing.
    for (const k of ["LK-99999", first.id, "LK-0", "nonsense"]) expect((await find(a.id, k)).status).toBe(404);
    // Someone who can't read the project learns nothing.
    expect((await find(a.id, key, stranger.cookie)).status).toBe(403);

    // The same number in another group's project is another item.
    const otherGroup = nanoid(), otherProject = nanoid(), otherList = nanoid();
    await db.insert(groups).values({ id: otherGroup, name: "Elsewhere", keyPrefix: "EL", ownerId: owner.id });
    await db.insert(projects).values({ id: otherProject, groupId: otherGroup, name: "Elsewhere" });
    await db.insert(lists).values({ id: otherList, projectId: otherProject, name: "To-do" });
    await db.insert(items).values({ id: nanoid(), projectId: otherProject, listId: otherList, title: "Not this one", keyNumber: 777 });
    expect((await find(a.id, "LK-777")).status).toBe(404);
  });
});

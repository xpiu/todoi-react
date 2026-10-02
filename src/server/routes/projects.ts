import { and, asc, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { idSchema } from "../../shared/items";
import { importProjectSchema } from "../../shared/import";
import { createGroupSchema, createListSchema, createProjectSchema, memberRoleSchema, updateGroupSchema, updateListSchema, updateProjectSchema } from "../../shared/projects";
import { viewerOf } from "../auth";
import { db } from "../db";
import { groups, items, lists, members, projects, users } from "../db/schema";
import { createProject, importProject, listsWithCounts, memberProjectIds, updateList } from "../services/projects";

import { destroyItem, destroyProject, itemContainersLive, itemIsLive, setProjectLifecycle } from "../services/lifecycle";
import { fail, validate } from "../errors";

const idParam = validate("param", z.object({ id: idSchema }));
const liveGroups = and(isNull(groups.archivedAt), isNull(groups.deletedAt));
const liveProjects = and(isNull(projects.archivedAt), isNull(projects.deletedAt));

export const groupsRoute = new Hono()
  // The sidebar: every live group with its live projects.
  .get("/", async (c) => {
    const viewer = viewerOf(c);
    const mine = await memberProjectIds(viewer.userId);
    const ps = mine.length ? await db.select().from(projects).where(and(liveProjects, inArray(projects.id, mine))).orderBy(asc(projects.position), asc(projects.createdAt)) : [];
    const groupIds = [...new Set(ps.map((p) => p.groupId))];
    const gs = await db.select().from(groups).where(and(liveGroups, or(eq(groups.ownerId, viewer.userId), groupIds.length ? inArray(groups.id, groupIds) : undefined))).orderBy(asc(groups.position), asc(groups.createdAt));
    const [counts, owners] = await Promise.all([
      db
        .select({ projectId: items.projectId, items: sql<number>`count(*)::int`, done: sql<number>`count(*) filter (where ${items.done})::int` })
        .from(items)
        .where(and(inArray(items.projectId, mine), isNull(items.parentItemId), itemIsLive))
        .groupBy(items.projectId),
      db.select({ projectId: members.projectId, name: users.name }).from(members).innerJoin(users, eq(users.id, members.userId)).where(and(inArray(members.projectId, mine), eq(members.role, "owner"))),
    ]);
    const stat = (id: string) => {
      const c = counts.find((x) => x.projectId === id);
      return { itemCount: c?.items ?? 0, doneCount: c?.done ?? 0, lead: owners.find((o) => o.projectId === id)?.name ?? null };
    };
    return c.json(gs.map((g) => ({ ...g, projects: ps.filter((p) => p.groupId === g.id).map((p) => ({ ...p, ...stat(p.id) })) })));
  })
  .post("/", validate("json", createGroupSchema), async (c) => {
    const viewer = viewerOf(c);
    const max = (await db.select({ max: sql<number>`coalesce(max(${groups.position}), -1)` }).from(groups).where(eq(groups.ownerId, viewer.userId)))[0]?.max ?? -1;
    const [row] = await db
      .insert(groups)
      .values({ ...c.req.valid("json"), ownerId: viewer.userId, position: max + 1 })
      .returning();
    return c.json(row!, 201);
  })
  .patch("/:id", idParam, validate("json", updateGroupSchema), async (c) => {
    const [row] = await db.update(groups).set(c.req.valid("json")).where(eq(groups.id, c.req.valid("param").id)).returning();
    return row ? c.json(row) : fail(c, 404, "Not found");
  })
  .delete("/:id", idParam, async (c) => {
    const [row] = await db.update(groups).set({ deletedAt: new Date() }).where(eq(groups.id, c.req.valid("param").id)).returning({ id: groups.id });
    return row ? c.body(null, 204) : fail(c, 404, "Not found");
  });

export const projectsRoute = new Hono()
  .get("/:id", idParam, async (c) => {
    const { id } = c.req.valid("param");
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    if (!project) return fail(c, 404, "Not found");
    const [group] = await db.select().from(groups).where(eq(groups.id, project.groupId));
    const ls = await listsWithCounts(id);
    const ms = await db
      .select({ projectId: members.projectId, userId: members.userId, role: members.role, createdAt: members.createdAt, name: users.name, email: users.email, nickname: users.nickname, avatarColor: users.avatarColor, image: users.image })
      .from(members)
      .innerJoin(users, eq(users.id, members.userId))
      .where(eq(members.projectId, id));
    const [archived] = await db.select({ n: sql<number>`count(*)::int` }).from(items).where(and(eq(items.projectId, id), isNotNull(items.archivedAt), isNull(items.deletedAt), itemContainersLive));
    return c.json({ ...project, keyPrefix: group?.keyPrefix ?? "", groupName: group?.name ?? "", lists: ls.map((r) => ({ ...r.list, count: r.count })), members: ms, archivedCount: archived?.n ?? 0 });
  })
  .post("/", validate("json", createProjectSchema), async (c) => {
    const viewer = viewerOf(c);
    const result = await createProject(c.req.valid("json"), viewer.userId);
    return c.json(result, 201);
  })
  // A reviewed import plan becomes a project in one transaction (Markdown / Trello / CSV).
  .post("/import", validate("json", importProjectSchema), async (c) => {
    const viewer = viewerOf(c);
    const result = await importProject(c.req.valid("json"), viewer.userId);
    return c.json(result, 201);
  })
  .patch("/:id", idParam, validate("json", updateProjectSchema), async (c) => {
    const [row] = await db.update(projects).set(c.req.valid("json")).where(eq(projects.id, c.req.valid("param").id)).returning();
    return row ? c.json(row) : fail(c, 404, "Not found");
  })
  .post("/:id/archive", idParam, async (c) => {
    const row = await setProjectLifecycle(c.req.valid("param").id, { archived: true });
    return row ? c.json(row) : fail(c, 404, "Not found");
  })
  .post("/:id/restore", idParam, async (c) => {
    const row = await setProjectLifecycle(c.req.valid("param").id, { archived: false, deleted: false });
    return row ? c.json(row) : fail(c, 404, "Not found");
  })
  .delete("/:id", idParam, async (c) => {
    const row = await setProjectLifecycle(c.req.valid("param").id, { deleted: true });
    return row ? c.body(null, 204) : fail(c, 404, "Not found");
  });

const roleBody = validate("json", z.object({ role: memberRoleSchema }));
export const membersRoute = new Hono()
  .put("/:id/members/:userId", validate("param", z.object({ id: idSchema, userId: z.string().min(1) })), roleBody, async (c) => {
    const { id, userId } = c.req.valid("param");
    const { role } = c.req.valid("json");
    await db.insert(members).values({ projectId: id, userId, role }).onConflictDoUpdate({ target: [members.projectId, members.userId], set: { role } });
    return c.json({ projectId: id, userId, role });
  })
  .delete("/:id/members/:userId", validate("param", z.object({ id: idSchema, userId: z.string().min(1) })), async (c) => {
    const { id, userId } = c.req.valid("param");
    await db.delete(members).where(and(eq(members.projectId, id), eq(members.userId, userId)));
    return c.body(null, 204);
  });

/** Archived and trashed projects and items, account-wide or for one project. */
export const archiveRoute = new Hono()
  .get("/", validate("query", z.object({ projectId: idSchema.optional() })), async (c) => {
    const { projectId } = c.req.valid("query");
    const viewer = viewerOf(c);
    const mine = await memberProjectIds(viewer.userId);
    const removed = or(isNotNull(items.archivedAt), isNotNull(items.deletedAt));
    const its = await db
      .select({ item: items, listName: lists.name, projectName: projects.name, keyPrefix: groups.keyPrefix })
      .from(items)
      .leftJoin(lists, eq(lists.id, items.listId))
      .leftJoin(projects, eq(projects.id, items.projectId))
      .leftJoin(groups, eq(groups.id, projects.groupId))
      .where(and(removed, itemContainersLive, projectId ? and(inArray(items.projectId, mine), eq(items.projectId, projectId)) : or(inArray(items.projectId, mine), eq(items.listId, viewer.inboxListId))))
      .orderBy(desc(items.updatedAt));
    const ps = projectId
      ? []
      : await db
          .select({ project: projects, groupName: groups.name })
          .from(projects)
          .leftJoin(groups, eq(groups.id, projects.groupId))
          .where(and(inArray(projects.id, mine), or(isNotNull(projects.archivedAt), isNotNull(projects.deletedAt))))
          .orderBy(desc(projects.updatedAt));
    return c.json({
      items: its.map((r) => ({ ...r.item, listName: r.listName, projectName: r.projectName, keyPrefix: r.keyPrefix })),
      projects: ps.map((r) => ({ ...r.project, groupName: r.groupName })),
    });
  })
  // Delete forever: an item row or a project with everything in it.
  .delete("/items/:id", idParam, async (c) => {
    await destroyItem(c.req.valid("param").id);
    return c.body(null, 204);
  })
  .delete("/projects/:id", idParam, async (c) => {
    await destroyProject(c.req.valid("param").id);
    return c.body(null, 204);
  });

export const listsRoute = new Hono()
  .post("/", validate("json", createListSchema), async (c) => {
    const input = c.req.valid("json");
    const max = (await db.select({ max: sql<number>`coalesce(max(${lists.position}), -1)` }).from(lists).where(eq(lists.projectId, input.projectId)))[0]?.max ?? -1;
    const [row] = await db
      .insert(lists)
      .values({ ...input, position: max + 1 })
      .returning();
    return c.json(row!, 201);
  })
  .patch("/:id", idParam, validate("json", updateListSchema), async (c) => {
    const result = await updateList(c.req.valid("param").id, c.req.valid("json"));
    return result ? c.json(result) : fail(c, 404, "Not found");
  })
  .delete("/:id", idParam, async (c) => {
    const [row] = await db.delete(lists).where(eq(lists.id, c.req.valid("param").id)).returning({ id: lists.id });
    return row ? c.body(null, 204) : fail(c, 404, "Not found");
  });

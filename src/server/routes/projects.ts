import { zValidator } from "@hono/zod-validator";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { idSchema } from "../../shared/items";
import { createGroupSchema, createListSchema, createProjectSchema, updateGroupSchema, updateListSchema, updateProjectSchema } from "../../shared/projects";
import { viewerOf } from "../auth";
import { db } from "../db";
import { groups, lists, members, projects } from "../db/schema";
import { createProject, listsWithCounts, updateList } from "../services/projects";

const idParam = zValidator("param", z.object({ id: idSchema }));
const liveGroups = and(isNull(groups.archivedAt), isNull(groups.deletedAt));
const liveProjects = and(isNull(projects.archivedAt), isNull(projects.deletedAt));

export const groupsRoute = new Hono()
  // The sidebar: every live group with its live projects.
  .get("/", async (c) => {
    const gs = await db.select().from(groups).where(liveGroups).orderBy(asc(groups.position), asc(groups.createdAt));
    const ps = await db.select().from(projects).where(liveProjects).orderBy(asc(projects.position), asc(projects.createdAt));
    return c.json(gs.map((g) => ({ ...g, projects: ps.filter((p) => p.groupId === g.id) })));
  })
  .post("/", zValidator("json", createGroupSchema), async (c) => {
    const viewer = viewerOf(c);
    const max = (await db.select({ max: sql<number>`coalesce(max(${groups.position}), -1)` }).from(groups))[0]?.max ?? -1;
    const [row] = await db
      .insert(groups)
      .values({ ...c.req.valid("json"), ownerId: viewer.userId, position: max + 1 })
      .returning();
    return c.json(row!, 201);
  })
  .patch("/:id", idParam, zValidator("json", updateGroupSchema), async (c) => {
    const [row] = await db.update(groups).set(c.req.valid("json")).where(eq(groups.id, c.req.valid("param").id)).returning();
    return row ? c.json(row) : c.json({ error: "Not found" }, 404);
  })
  .delete("/:id", idParam, async (c) => {
    const [row] = await db.update(groups).set({ deletedAt: new Date() }).where(eq(groups.id, c.req.valid("param").id)).returning({ id: groups.id });
    return row ? c.body(null, 204) : c.json({ error: "Not found" }, 404);
  });

export const projectsRoute = new Hono()
  .get("/:id", idParam, async (c) => {
    const { id } = c.req.valid("param");
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    if (!project) return c.json({ error: "Not found" }, 404);
    const [group] = await db.select().from(groups).where(eq(groups.id, project.groupId));
    const ls = await listsWithCounts(id);
    const ms = await db.select().from(members).where(eq(members.projectId, id));
    return c.json({ ...project, keyPrefix: group?.keyPrefix ?? "", groupName: group?.name ?? "", lists: ls.map((r) => ({ ...r.list, count: r.count })), members: ms });
  })
  .post("/", zValidator("json", createProjectSchema), async (c) => {
    const viewer = viewerOf(c);
    const result = await createProject(c.req.valid("json"), viewer.userId);
    return c.json(result, 201);
  })
  .patch("/:id", idParam, zValidator("json", updateProjectSchema), async (c) => {
    const [row] = await db.update(projects).set(c.req.valid("json")).where(eq(projects.id, c.req.valid("param").id)).returning();
    return row ? c.json(row) : c.json({ error: "Not found" }, 404);
  })
  .post("/:id/archive", idParam, async (c) => {
    const [row] = await db.update(projects).set({ archivedAt: new Date() }).where(eq(projects.id, c.req.valid("param").id)).returning();
    return row ? c.json(row) : c.json({ error: "Not found" }, 404);
  })
  .post("/:id/restore", idParam, async (c) => {
    const [row] = await db.update(projects).set({ archivedAt: null, deletedAt: null }).where(eq(projects.id, c.req.valid("param").id)).returning();
    return row ? c.json(row) : c.json({ error: "Not found" }, 404);
  })
  .delete("/:id", idParam, async (c) => {
    const [row] = await db.update(projects).set({ deletedAt: new Date() }).where(eq(projects.id, c.req.valid("param").id)).returning({ id: projects.id });
    return row ? c.body(null, 204) : c.json({ error: "Not found" }, 404);
  });

export const listsRoute = new Hono()
  .post("/", zValidator("json", createListSchema), async (c) => {
    const input = c.req.valid("json");
    const max = (await db.select({ max: sql<number>`coalesce(max(${lists.position}), -1)` }).from(lists).where(eq(lists.projectId, input.projectId)))[0]?.max ?? -1;
    const [row] = await db
      .insert(lists)
      .values({ ...input, position: max + 1 })
      .returning();
    return c.json(row!, 201);
  })
  .patch("/:id", idParam, zValidator("json", updateListSchema), async (c) => {
    const result = await updateList(c.req.valid("param").id, c.req.valid("json"));
    return result ? c.json(result) : c.json({ error: "Not found" }, 404);
  })
  .delete("/:id", idParam, async (c) => {
    const [row] = await db.delete(lists).where(eq(lists.id, c.req.valid("param").id)).returning({ id: lists.id });
    return row ? c.body(null, 204) : c.json({ error: "Not found" }, 404);
  });

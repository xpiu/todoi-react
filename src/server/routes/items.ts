import { zValidator } from "@hono/zod-validator";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { createItemSchema, idSchema, moveItemSchema, updateItemSchema } from "../../shared/items";
import { viewerOf } from "../auth";
import { db } from "../db";
import { items, lists, projects } from "../db/schema";
import { moveItem, setDone } from "../services/items";
import { logActivity, quote } from "../services/activity";
import { issueKeyNumber } from "../services/projects";

const idParam = zValidator("param", z.object({ id: idSchema }));
const listQuery = zValidator("query", z.object({ listId: idSchema.optional(), projectId: idSchema.optional() }));

/** Items that are neither archived nor in the Trash. */
const live = and(isNull(items.archivedAt), isNull(items.deletedAt));

export const itemsRoute = new Hono()
  // GET /api/items?listId= | ?projectId= — defaults to the caller's Inbox.
  .get("/", listQuery, async (c) => {
    const { listId, projectId } = c.req.valid("query");
    const viewer = viewerOf(c);
    const scope = projectId ? eq(items.projectId, projectId) : eq(items.listId, listId ?? viewer.inboxListId);
    const rows = await db
      .select()
      .from(items)
      .where(and(scope, live))
      .orderBy(asc(items.position), asc(items.createdAt));
    return c.json(rows);
  })
  .post("/", zValidator("json", createItemSchema), async (c) => {
    const viewer = viewerOf(c);
    const input = c.req.valid("json");
    const listId = input.listId ?? viewer.inboxListId;
    const [list] = await db.select().from(lists).where(eq(lists.id, listId));
    if (!list) return c.json({ error: "List not found" }, 404);
    const status = input.status === undefined ? (list.statusRole ?? null) : input.status;
    const row = await db.transaction(async (tx) => {
      const max = (await tx.select({ max: sql<number>`coalesce(max(${items.position}), -1)` }).from(items).where(eq(items.listId, listId)))[0]?.max ?? -1;
      // Items in a project get a key from the group's counter at once; Inbox items get one when filed.
      let keyNumber: number | null = null;
      if (list.projectId) {
        const [project] = await tx.select({ groupId: projects.groupId }).from(projects).where(eq(projects.id, list.projectId));
        if (project) keyNumber = await issueKeyNumber(tx, project.groupId);
      }
      const [created] = await tx
        .insert(items)
        .values({ ...input, listId, projectId: list.projectId, status, keyNumber, position: max + 1, createdBy: viewer.userId })
        .returning();
      await logActivity(tx, { projectId: list.projectId, actorId: viewer.userId, type: "item", text: `added ${quote(created!.title)} to ${list.name}`, itemId: created!.id, itemKey: keyNumber != null ? String(keyNumber) : null });
      return created!;
    });
    return c.json(row, 201);
  })
  .patch("/:id", idParam, zValidator("json", updateItemSchema), async (c) => {
    const { id } = c.req.valid("param");
    const { done, ...changes } = c.req.valid("json");
    if (done !== undefined) {
      const row = await setDone(id, done, viewerOf(c).userId);
      if (!row) return c.notFound();
      if (!Object.keys(changes).length) return c.json(row);
    }
    const [row] = await db.update(items).set(changes).where(eq(items.id, id)).returning();
    return row ? c.json(row) : c.notFound();
  })
  // Move within or across lists; a linked list role updates the Status in the same transaction.
  .post("/:id/move", idParam, zValidator("json", moveItemSchema), async (c) => {
    const result = await moveItem(c.req.valid("param").id, c.req.valid("json"), viewerOf(c).userId);
    return result ? c.json(result) : c.notFound();
  })
  .delete("/:id", idParam, async (c) => {
    // Delete = move to the Trash (90 days); "Delete forever" is a later, explicit action.
    const [row] = await db
      .update(items)
      .set({ deletedAt: new Date() })
      .where(eq(items.id, c.req.valid("param").id))
      .returning();
    if (!row) return c.notFound();
    await logActivity(db, { projectId: row.projectId, actorId: viewerOf(c).userId, type: "item", text: `deleted ${quote(row.title)}`, itemId: row.id, itemKey: row.keyNumber != null ? String(row.keyNumber) : null });
    return c.body(null, 204);
  });

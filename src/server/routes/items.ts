import { zValidator } from "@hono/zod-validator";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { createItemSchema, idSchema, moveItemSchema, updateItemSchema } from "../../shared/items";
import { viewerOf } from "../auth";
import { db } from "../db";
import { attachments, itemAssignees, itemLabels, items, lists, projects } from "../db/schema";
import { moveItem, setDone } from "../services/items";
import { logActivity, quote } from "../services/activity";
import { issueKeyNumber } from "../services/projects";

const idParam = zValidator("param", z.object({ id: idSchema }));
const listQuery = zValidator("query", z.object({ listId: idSchema.optional(), projectId: idSchema.optional() }));

/** Items that are neither archived nor in the Trash. */
const live = and(isNull(items.archivedAt), isNull(items.deletedAt));

type ItemRow = typeof items.$inferSelect;
/** Attach each item's label and assignee ids (one query each for the whole set). */
async function withRelations(rows: ItemRow[]) {
  if (!rows.length) return [] as Array<ItemRow & { labelIds: string[]; assigneeIds: string[]; attachmentCount: number }>;
  const ids = rows.map((r) => r.id);
  const [labelRows, assigneeRows, attachmentRows] = await Promise.all([
    db.select().from(itemLabels).where(inArray(itemLabels.itemId, ids)),
    db.select().from(itemAssignees).where(inArray(itemAssignees.itemId, ids)),
    db.select({ itemId: attachments.itemId, n: sql<number>`count(*)::int` }).from(attachments).where(inArray(attachments.itemId, ids)).groupBy(attachments.itemId),
  ]);
  return rows.map((r) => ({ ...r, labelIds: labelRows.filter((l) => l.itemId === r.id).map((l) => l.labelId), assigneeIds: assigneeRows.filter((a) => a.itemId === r.id).map((a) => a.userId), attachmentCount: attachmentRows.find((a) => a.itemId === r.id)?.n ?? 0 }));
}

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
    return c.json(await withRelations(rows));
  })
  .post("/", zValidator("json", createItemSchema), async (c) => {
    const viewer = viewerOf(c);
    const input = c.req.valid("json");
    const listId = input.listId ?? viewer.inboxListId;
    const [list] = await db.select().from(lists).where(eq(lists.id, listId));
    if (!list) return c.json({ error: "List not found" }, 404);
    const { labelIds = [], assigneeIds = [], ...fields } = input;
    const status = fields.status === undefined ? (list.statusRole ?? null) : fields.status;
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
        .values({ ...fields, listId, projectId: list.projectId, status, keyNumber, position: max + 1, createdBy: viewer.userId })
        .returning();
      if (labelIds.length) await tx.insert(itemLabels).values(labelIds.map((labelId) => ({ itemId: created!.id, labelId }))).onConflictDoNothing();
      if (assigneeIds.length) await tx.insert(itemAssignees).values(assigneeIds.map((userId) => ({ itemId: created!.id, userId }))).onConflictDoNothing();
      await logActivity(tx, { projectId: list.projectId, actorId: viewer.userId, type: "item", text: `added ${quote(created!.title)} to ${list.name}`, itemId: created!.id, itemKey: keyNumber != null ? String(keyNumber) : null });
      return created!;
    });
    return c.json({ ...row, labelIds, assigneeIds, attachmentCount: 0 }, 201);
  })
  .patch("/:id", idParam, zValidator("json", updateItemSchema), async (c) => {
    const { id } = c.req.valid("param");
    const { done, archived, parentItemId, ...rest } = c.req.valid("json");
    const changes: Partial<ItemRow> = { ...rest };
    if (archived !== undefined) changes.archivedAt = archived ? new Date() : null;
    if (parentItemId !== undefined) {
      // A subitem lives in its parent's list; promoting keeps the list it is in.
      changes.parentItemId = parentItemId;
      if (parentItemId) {
        const [parent] = await db.select({ listId: items.listId, projectId: items.projectId }).from(items).where(eq(items.id, parentItemId));
        if (!parent) return c.json({ error: "Not found" }, 404);
        changes.listId = parent.listId;
        changes.projectId = parent.projectId;
      }
    }
    if (done !== undefined) {
      const row = await setDone(id, done, viewerOf(c).userId);
      if (!row) return c.json({ error: "Not found" }, 404);
      if (!Object.keys(changes).length) return c.json(row);
    }
    const [row] = await db.update(items).set(changes).where(eq(items.id, id)).returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    if (archived !== undefined) await logActivity(db, { projectId: row.projectId, actorId: viewerOf(c).userId, type: "item", text: `${archived ? "archived" : "restored"} ${quote(row.title)}`, itemId: row.id, itemKey: row.keyNumber != null ? String(row.keyNumber) : null });
    return c.json(row);
  })
  // Move within or across lists; a linked list role updates the Status in the same transaction.
  .post("/:id/move", idParam, zValidator("json", moveItemSchema), async (c) => {
    const result = await moveItem(c.req.valid("param").id, c.req.valid("json"), viewerOf(c).userId);
    return result ? c.json(result) : c.json({ error: "Not found" }, 404);
  })
  .delete("/:id", idParam, async (c) => {
    // Delete = move to the Trash (90 days); "Delete forever" is a later, explicit action.
    const [row] = await db
      .update(items)
      .set({ deletedAt: new Date() })
      .where(eq(items.id, c.req.valid("param").id))
      .returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    await logActivity(db, { projectId: row.projectId, actorId: viewerOf(c).userId, type: "item", text: `deleted ${quote(row.title)}`, itemId: row.id, itemKey: row.keyNumber != null ? String(row.keyNumber) : null });
    return c.body(null, 204);
  });

import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { createItemSchema, duplicateItemSchema, idSchema, moveItemSchema, updateItemSchema } from "../../shared/items";
import { viewerOf } from "../auth";
import { db, inRequestTransaction } from "../db";
import { attachments, groups, itemAssignees, itemLabels, items, lists, projects } from "../db/schema";
import { statusChange } from "../../shared/completion";
import { duplicateItem, moveItem, placeAmongSiblings, updateItem } from "../services/items";
import { logActivity, quote } from "../services/activity";
import { itemContainersLive, itemIsLive, setItemLifecycle } from "../services/lifecycle";
import { issueKeyNumber } from "../services/projects";
import { deliver, notifyPeople } from "../services/notifications";
import { fail, validate } from "../errors";

const idParam = validate("param", z.object({ id: idSchema }));
const listQuery = validate("query", z.object({ listId: idSchema.optional(), projectId: idSchema.optional() }));

type ItemRow = typeof items.$inferSelect;
/** Attach each item's label and assignee ids (one query each for the whole set). */
async function withRelations(rows: ItemRow[]) {
  if (!rows.length) return [] as Array<ItemRow & { labelIds: string[]; assigneeIds: string[]; attachmentCount: number }>;
  const ids = rows.map((r) => r.id);
  const labelQuery = db.select().from(itemLabels).where(inArray(itemLabels.itemId, ids));
  const assigneeQuery = db.select().from(itemAssignees).where(inArray(itemAssignees.itemId, ids));
  const attachmentQuery = db.select({ itemId: attachments.itemId, n: sql<number>`count(*)::int` }).from(attachments).where(inArray(attachments.itemId, ids)).groupBy(attachments.itemId);
  // A queued write uses one transaction connection; ordinary reads can use the pool in parallel.
  const [labelRows, assigneeRows, attachmentRows] = inRequestTransaction()
    ? [await labelQuery, await assigneeQuery, await attachmentQuery]
    : await Promise.all([labelQuery, assigneeQuery, attachmentQuery]);
  return rows.map((r) => ({ ...r, labelIds: labelRows.filter((l) => l.itemId === r.id).map((l) => l.labelId), assigneeIds: assigneeRows.filter((a) => a.itemId === r.id).map((a) => a.userId), attachmentCount: attachmentRows.find((a) => a.itemId === r.id)?.n ?? 0 }));
}

export const itemsRoute = new Hono()
  // GET /api/items?listId= | ?projectId= — defaults to the caller's Inbox.
  .get("/", listQuery, async (c) => {
    const { listId, projectId } = c.req.valid("query");
    const scope = projectId ? eq(items.projectId, projectId) : eq(items.listId, listId ?? viewerOf(c).inboxListId);
    const rows = await db
      .select()
      .from(items)
      .where(and(scope, itemIsLive))
      .orderBy(asc(items.position), asc(items.createdAt));
    return c.json(await withRelations(rows));
  })
  // One item by id, whatever its state: an overlay link can say the item is archived, in the Trash, inside
  // an archived project or parent, or now lives elsewhere — instead of showing nothing.
  .get("/:id", idParam, async (c) => {
    const [row] = await db
      .select({ item: items, live: sql<boolean>`${itemContainersLive}`, projectName: projects.name, keyPrefix: groups.keyPrefix })
      .from(items)
      .leftJoin(projects, eq(projects.id, items.projectId))
      .leftJoin(groups, eq(groups.id, projects.groupId))
      .where(eq(items.id, c.req.valid("param").id));
    if (!row) return fail(c, 404, "This item doesn't exist");
    const { item } = row;
    const state = item.deletedAt ? "deleted" : item.archivedAt ? "archived" : row.live ? "live" : "container";
    return c.json({ id: item.id, version: item.version, title: item.title, projectId: item.projectId, listId: item.listId, parentItemId: item.parentItemId, keyNumber: item.keyNumber, projectName: row.projectName, keyPrefix: row.keyPrefix, state } as const);
  })
  .post("/", validate("json", createItemSchema), async (c) => {
    const viewer = viewerOf(c);
    const input = c.req.valid("json");
    const listId = input.listId ?? viewer.inboxListId;
    const [list] = await db.select().from(lists).where(eq(lists.id, listId));
    if (!list) return fail(c, 404, "List not found");
    const { labelIds = [], assigneeIds = [], position: where = "bottom", ...fields } = input;
    // Created in a Done list (or as Done) means done, by the same rule as every other path.
    const state = statusChange({ status: null, done: false, priorStatus: null }, fields.status === undefined ? (list.statusRole ?? null) : fields.status);
    const row = await db.transaction(async (tx) => {
      // Additions to one list take turns, so simultaneous ones each get their own place.
      await tx.select({ id: lists.id }).from(lists).where(eq(lists.id, listId)).for("update");
      const placed: { position?: number } = {};
      if (fields.parentItemId) placed.position = ((await tx.select({ max: sql<number>`coalesce(max(${items.position}), -1)` }).from(items).where(eq(items.listId, listId)))[0]?.max ?? -1) + 1;
      else await placeAmongSiblings(tx, fields.id, listId, where === "top" ? 0 : undefined, placed);
      // Items in a project get a key from the group's counter at once; Inbox items get one when filed.
      let keyNumber: number | null = null;
      if (list.projectId) {
        const [project] = await tx.select({ groupId: projects.groupId }).from(projects).where(eq(projects.id, list.projectId));
        if (project) keyNumber = await issueKeyNumber(tx, project.groupId);
      }
      const [created] = await tx
        .insert(items)
        .values({ ...fields, ...state, listId, projectId: list.projectId, keyNumber, position: placed.position!, createdBy: viewer.userId })
        .returning();
      if (labelIds.length) await tx.insert(itemLabels).values(labelIds.map((labelId) => ({ itemId: created!.id, labelId }))).onConflictDoNothing();
      if (assigneeIds.length) await tx.insert(itemAssignees).values(assigneeIds.map((userId) => ({ itemId: created!.id, userId }))).onConflictDoNothing();
      await logActivity(tx, { projectId: list.projectId, actorId: viewer.userId, type: "item", text: `added ${quote(created!.title)} to ${list.name}`, itemId: created!.id, itemKey: keyNumber != null ? String(keyNumber) : null });
      return created!;
    });
    if (assigneeIds.length) await deliver(notifyPeople("assignment", assigneeIds, viewer, row));
    const [current] = await db.select().from(items).where(eq(items.id, row.id));
    return c.json({ ...(current ?? row), labelIds, assigneeIds, attachmentCount: 0 }, 201);
  })
  .patch("/:id", idParam, validate("json", updateItemSchema), async (c) => {
    const { id } = c.req.valid("param");
    const { done, status, ifDue, archived, deleted, parentItemId, ...rest } = c.req.valid("json");
    const changes: Partial<ItemRow> = { ...rest };
    if (parentItemId !== undefined) {
      // A subitem lives in its parent's list; promoting keeps the list it is in.
      changes.parentItemId = parentItemId;
      if (parentItemId) {
        const [parent] = await db.select({ listId: items.listId, projectId: items.projectId }).from(items).where(eq(items.id, parentItemId));
        if (!parent) return fail(c, 404, "Not found");
        changes.listId = parent.listId;
        changes.projectId = parent.projectId;
      }
    }
    const result = await updateItem(id, { done, status, ifDue }, changes, { archived, deleted }, viewerOf(c).userId);
    if (!result) return fail(c, 404, "Not found");
    // `occurrence`: the recurring occurrence this request completed, for the client's toast and Undo.
    const [item] = await withRelations([result.item]);
    return c.json({ ...item!, occurrence: result.occurrence });
  })
  // Move within or across lists; a linked list role updates the Status in the same transaction.
  .post("/:id/move", idParam, validate("json", moveItemSchema), async (c) => {
    const result = await moveItem(c.req.valid("param").id, c.req.valid("json"), viewerOf(c).userId);
    if (!result) return fail(c, 404, "Not found");
    // Canonical relations travel with the acknowledgment so a reload need not await another read.
    const family = await db.select().from(items).where(sql`${items.id} = ${result.item.id} or ${items.parentItemId} = ${result.item.id}`);
    const moved = await withRelations(family);
    return c.json({ ...result, item: moved.find((item) => item.id === result.item.id)!, items: moved });
  })
  // Copy into a list: the copy and its subitems (root first), and what was not carried over.
  .post("/:id/duplicate", idParam, validate("json", duplicateItemSchema), async (c) => {
    // A resent copy id fails on the primary key (409, "That already exists") and changes nothing.
    const result = await duplicateItem(c.req.valid("param").id, c.req.valid("json"), viewerOf(c).userId);
    if (!result) return fail(c, 404, "Not found");
    return c.json({ items: await withRelations(result.items), report: result.report }, 201);
  })
  .delete("/:id", idParam, async (c) => {
    // Delete = move to the Trash (90 days); "Delete forever" is a later, explicit action.
    const row = await setItemLifecycle(c.req.valid("param").id, { deleted: true }, viewerOf(c).userId);
    if (!row) return fail(c, 404, "Not found");
    return c.body(null, 204);
  });

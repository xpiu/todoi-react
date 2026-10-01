// Item behaviours that touch more than one column or row, kept out of the route handlers so the
// board, list, bulk and keyboard paths all share them. Spec: DESIGN.md › Lists & Status linking.
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";

import type { MoveItemInput } from "../../shared/items";
import { db } from "../db";
import { groups, items, lists, projects, type Item } from "../db/schema";
import { logActivity, quote } from "./activity";

/** Checkbox semantics: checking sets Status to Done and remembers the prior Status; unchecking restores it. */
export async function setDone(id: string, done: boolean, actorId: string | null = null): Promise<Item | null> {
  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(items).where(eq(items.id, id));
    if (!cur) return null;
    const patch = done ? { done: true, status: "DONE" as const, priorStatus: cur.status === "DONE" ? cur.priorStatus : cur.status } : { done: false, status: cur.priorStatus, priorStatus: null };
    const [row] = await tx.update(items).set(patch).where(eq(items.id, id)).returning();
    if (row) await logActivity(tx, { projectId: row.projectId, actorId, type: "item", text: `${done ? "completed" : "reopened"} ${quote(row.title)}`, itemId: row.id, itemKey: keyOf(row) });
    return row ?? null;
  });
}

/** "MP-112" from a row, when it has a key (the prefix is looked up by the caller when needed). */
const keyOf = (row: Item) => (row.keyNumber != null ? String(row.keyNumber) : null);

export interface MoveResult {
  item: Item;
  /** What changed besides the list, so the toast can say "— Status set to Doing" */
  changed: { list: boolean; project: boolean; status: { from: Item["status"]; to: Item["status"] } | null; key: boolean };
}

/**
 * Move an item to a list (same or another project) at a position among the destination's top-level items.
 * A linked destination role updates the Status atomically; a group change re-issues the key. Subitems follow their parent.
 */
export async function moveItem(id: string, { listId, position }: MoveItemInput, actorId: string | null = null): Promise<MoveResult | null> {
  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(items).where(eq(items.id, id));
    if (!cur) return null;
    const [dest] = await tx.select().from(lists).where(eq(lists.id, listId));
    if (!dest) return null;
    const destProject = dest.projectId ? (await tx.select().from(projects).where(eq(projects.id, dest.projectId)))[0] ?? null : null;
    const srcProject = cur.projectId ? (await tx.select().from(projects).where(eq(projects.id, cur.projectId)))[0] ?? null : null;

    const patch: Partial<Item> = { listId: dest.id, projectId: dest.projectId };
    let status: MoveResult["changed"]["status"] = null;
    if (dest.id !== cur.listId && dest.statusRole && destProject?.linkStatuses && dest.statusRole !== cur.status) {
      status = { from: cur.status, to: dest.statusRole };
      patch.status = dest.statusRole;
      patch.done = dest.statusRole === "DONE";
    }
    // Keys live per group: a new group issues a new number; the same group keeps it.
    let key = false;
    if (destProject && destProject.groupId !== srcProject?.groupId) {
      const [g] = await tx
        .update(groups)
        .set({ nextItemNumber: sql`${groups.nextItemNumber} + 1` })
        .where(eq(groups.id, destProject.groupId))
        .returning({ n: groups.nextItemNumber });
      patch.keyNumber = g!.n - 1;
      key = true;
    } else if (!destProject) {
      patch.keyNumber = null;
      key = cur.keyNumber != null;
    }

    // Position: shift the destination's top-level siblings to make room (or append).
    const siblings = await tx
      .select({ id: items.id })
      .from(items)
      .where(and(eq(items.listId, dest.id), isNull(items.parentItemId), isNull(items.deletedAt), ne(items.id, id)))
      .orderBy(asc(items.position), asc(items.createdAt));
    const at = position == null ? siblings.length : Math.max(0, Math.min(position, siblings.length));
    const order = [...siblings.slice(0, at).map((s) => s.id), id, ...siblings.slice(at).map((s) => s.id)];
    for (let i = 0; i < order.length; i++) {
      if (order[i] === id) patch.position = i;
      else await tx.update(items).set({ position: i }).where(eq(items.id, order[i]!));
    }

    const [row] = await tx.update(items).set(patch).where(eq(items.id, id)).returning();
    // Subitems travel with their parent (list, project and key prefix).
    await tx.update(items).set({ listId: dest.id, projectId: dest.projectId }).where(eq(items.parentItemId, id));
    if (dest.id !== cur.listId) {
      const [src] = await tx.select({ name: lists.name }).from(lists).where(eq(lists.id, cur.listId));
      const text = `moved ${quote(cur.title)} from ${src?.name ?? "the Inbox"} to ${dest.name}${status ? ` — Status set to ${status.to}` : ""}`;
      await logActivity(tx, { projectId: dest.projectId, actorId, type: "item", text, itemId: id, itemKey: keyOf(row!) });
    }
    return { item: row!, changed: { list: dest.id !== cur.listId, project: dest.projectId !== cur.projectId, status, key } };
  });
}

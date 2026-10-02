// Item behaviours that touch more than one column or row, kept out of the route handlers so the
// board, list, bulk and keyboard paths all share them. Spec: DESIGN.md › Lists & Status linking.
import { and, asc, eq, inArray, isNull, ne, notInArray, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import type { MoveItemInput, MoveRestore } from "../../shared/items";
import { db } from "../db";
import { groups, itemAssignees, itemLabels, itemRelations, items, itemWatchers, labels, lists, members, projects, type Item, type Project } from "../db/schema";
import { applyCompletion, statusChange, type Occurrence } from "../../shared/completion";
import { logActivity, quote } from "./activity";
import { itemIsLive, setItemLifecycle } from "./lifecycle";
import { issueKeyNumbers } from "./projects";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ItemState = { done?: boolean; status?: Item["status"]; ifDue?: string };

/**
 * Update an item in one locked transaction: plain fields, then done / Status by the shared completion rules
 * (a recurring item moves to its next occurrence), then archive / restore. A completion whose `ifDue` no
 * longer matches was already applied (a retry) and changes nothing.
 */
export async function updateItem(id: string, state: ItemState, fields: Partial<Item>, lifecycle: { archived?: boolean; deleted?: boolean }, actorId: string): Promise<{ item: Item; occurrence: Occurrence | null } | null> {
  return db.transaction(async (tx) => {
    const [cur] = await tx.select().from(items).where(eq(items.id, id)).for("update");
    if (!cur) return null;
    const next = { ...cur, ...fields };
    const stale = state.done === true && !!next.repeatRule && state.ifDue !== undefined && next.dueDate !== state.ifDue;
    const { patch, occurrence } = stale ? { patch: {}, occurrence: null } : applyCompletion(next, state);
    const changes = { ...fields, ...patch };
    // Nothing left to write (a retried completion): answer with the item as it is.
    if (!Object.keys(changes).length && lifecycle.archived === undefined && lifecycle.deleted === undefined) return { item: cur, occurrence: null };
    const row = await setItemLifecycle(id, lifecycle, actorId, changes, tx);
    if (!row) return null;
    if (row.done !== cur.done || occurrence) {
      const verb = occurrence || row.done ? "completed" : "reopened";
      const repeats = occurrence && !occurrence.ended ? " — it repeats" : "";
      await logActivity(tx, { projectId: row.projectId, actorId, type: "item", text: `${verb} ${quote(row.title)}${repeats}`, itemId: row.id, itemKey: keyOf(row) });
    }
    return { item: row, occurrence };
  });
}

/** "MP-112" from a row, when it has a key (the prefix is looked up by the caller when needed). */
const keyOf = (row: Item) => (row.keyNumber != null ? String(row.keyNumber) : null);

export interface MoveResult {
  item: Item;
  /** What changed besides the list, so the toast can say "— Status set to Doing" */
  changed: {
    list: boolean;
    project: boolean;
    status: { from: Item["status"]; to: Item["status"] } | null;
    /** The new "PREFIX-N" key when the move re-issued it */
    key: string | null;
    /** Subitems that travelled with the item to another project */
    subitems: number;
    /** Labels created in the destination so the family keeps its labels */
    labelsCreated: string[];
    labelsRemoved: number;
    assigneesRemoved: number;
    watchersRemoved: number;
    relationsRemoved: number;
  };
  /** A cross-project move's record of what it took away, for its Undo to hand back */
  undo: MoveRestore | null;
}

/** The item and every descendant, root first, locked for the move. */
async function familyOf(tx: Tx, rootId: string): Promise<Item[]> {
  const family = await tx.select().from(items).where(eq(items.id, rootId)).for("update");
  for (let frontier = family.map((it) => it.id); frontier.length; ) {
    const children = await tx.select().from(items).where(inArray(items.parentItemId, frontier)).orderBy(asc(items.position), asc(items.createdAt)).for("update");
    family.push(...children);
    frontier = children.map((it) => it.id);
  }
  return family;
}

/** Keep a key number the destination project does not use (or the one an Undo hands back); issue the rest. */
async function familyKeys(tx: Tx, family: Item[], dest: Project | null, restore: MoveRestore | undefined): Promise<{ keys: Map<string, number | null>; prefix: string | null }> {
  if (!dest) return { keys: new Map(family.map((it) => [it.id, null])), prefix: null };
  const [group] = await tx.select().from(groups).where(eq(groups.id, dest.groupId));
  const sourceId = family[0]!.projectId;
  const sameGroup = !!sourceId && (await tx.select({ groupId: projects.groupId }).from(projects).where(eq(projects.id, sourceId)))[0]?.groupId === dest.groupId;
  const restored = new Map((restore?.keys ?? []).map((k) => [k.itemId, k.keyNumber]));
  const wantedOf = (it: Item) => {
    const n = restored.get(it.id) ?? (sameGroup ? it.keyNumber : null);
    return n != null && n < group!.nextItemNumber ? n : null;
  };
  const wanted = family.map(wantedOf).filter((n): n is number => n != null);
  const taken = new Set(
    wanted.length
      ? (await tx.select({ n: items.keyNumber }).from(items).where(and(eq(items.projectId, dest.id), inArray(items.keyNumber, wanted), notInArray(items.id, family.map((it) => it.id))))).map((r) => r.n)
      : [],
  );
  const keys = new Map<string, number | null>();
  const missing: Item[] = [];
  for (const it of family) {
    const n = wantedOf(it);
    if (n != null && !taken.has(n)) {
      keys.set(it.id, n);
      taken.add(n);
    } else missing.push(it);
  }
  let next = missing.length ? await issueKeyNumbers(tx, dest.groupId, missing.length) : 0;
  for (const it of missing) keys.set(it.id, next++);
  return { keys, prefix: group!.keyPrefix };
}

/** Labels belong to a project: the destination's label of the same name, created when missing; none in an Inbox. */
async function carryLabels(tx: Tx, ids: string[], destProjectId: string | null, undo: MoveRestore, changed: MoveResult["changed"]) {
  const rows = await tx
    .select({ itemId: itemLabels.itemId, labelId: itemLabels.labelId, name: labels.name, color: labels.color, projectId: labels.projectId })
    .from(itemLabels)
    .innerJoin(labels, eq(labels.id, itemLabels.labelId))
    .where(inArray(itemLabels.itemId, ids));
  const foreign = rows.filter((l) => l.projectId !== destProjectId);
  if (!foreign.length) return;
  await tx.delete(itemLabels).where(and(inArray(itemLabels.itemId, ids), inArray(itemLabels.labelId, foreign.map((l) => l.labelId))));
  if (!destProjectId) {
    undo.labels.push(...foreign.map(({ itemId, labelId }) => ({ itemId, labelId })));
    changed.labelsRemoved = new Set(foreign.map((l) => l.labelId)).size;
    return;
  }
  const existing = await tx.select().from(labels).where(eq(labels.projectId, destProjectId));
  const byName = new Map(existing.map((l) => [l.name.toLowerCase(), l.id]));
  let position = existing.reduce((max, l) => Math.max(max, l.position), -1);
  for (const l of foreign) {
    if (byName.has(l.name.toLowerCase())) continue;
    const [made] = await tx.insert(labels).values({ id: nanoid(), projectId: destProjectId, name: l.name, color: l.color, position: ++position }).returning({ id: labels.id });
    byName.set(l.name.toLowerCase(), made!.id);
    undo.createdLabelIds.push(made!.id);
    changed.labelsCreated.push(l.name);
  }
  await tx.insert(itemLabels).values(foreign.map((l) => ({ itemId: l.itemId, labelId: byName.get(l.name.toLowerCase())! }))).onConflictDoNothing();
}

/** Keep only the people the destination allows on the family; record the rest for the Undo. */
async function carryPeople(tx: Tx, table: typeof itemAssignees | typeof itemWatchers, ids: string[], allowed: (userId: string) => boolean, removed: MoveRestore["assignees"], back: MoveRestore["assignees"] | undefined): Promise<number> {
  const rows = await tx.select({ itemId: table.itemId, userId: table.userId }).from(table).where(inArray(table.itemId, ids));
  const gone = rows.filter((r) => !allowed(r.userId));
  for (const r of gone) await tx.delete(table).where(and(eq(table.itemId, r.itemId), eq(table.userId, r.userId)));
  removed.push(...gone);
  const restore = (back ?? []).filter((r) => ids.includes(r.itemId) && allowed(r.userId));
  if (restore.length) await tx.insert(table).values(restore).onConflictDoNothing();
  return gone.length;
}

/** Relations only join items in one project (or one Inbox), the rule the API applies when they are made. */
async function carryRelations(tx: Tx, ids: string[], dest: { projectId: string | null; listId: string }, undo: MoveRestore, back: MoveRestore["relations"] | undefined): Promise<number> {
  const inFamily = new Set(ids);
  const rows = await tx.select({ itemId: itemRelations.itemId, targetId: itemRelations.targetId, type: itemRelations.type }).from(itemRelations).where(or(inArray(itemRelations.itemId, ids), inArray(itemRelations.targetId, ids)));
  const returning = (back ?? []).filter((r) => inFamily.has(r.itemId) || inFamily.has(r.targetId));
  const others = [...new Set([...rows, ...returning].flatMap((r) => [r.itemId, r.targetId]).filter((id) => !inFamily.has(id)))];
  const scope = new Map((others.length ? await tx.select({ id: items.id, projectId: items.projectId, listId: items.listId }).from(items).where(inArray(items.id, others)) : []).map((o) => [o.id, o]));
  const together = (r: { itemId: string; targetId: string }) =>
    [r.itemId, r.targetId].every((id) => {
      if (inFamily.has(id)) return true;
      const o = scope.get(id);
      return !!o && o.projectId === dest.projectId && (!!dest.projectId || o.listId === dest.listId);
    });
  const gone = rows.filter((r) => !together(r));
  for (const r of gone) await tx.delete(itemRelations).where(and(eq(itemRelations.itemId, r.itemId), eq(itemRelations.targetId, r.targetId), eq(itemRelations.type, r.type)));
  undo.relations.push(...gone);
  const restore = returning.filter(together);
  if (restore.length) await tx.insert(itemRelations).values(restore).onConflictDoNothing();
  return gone.length;
}

/** Shift a list's live top-level items (the indices the views show) to make room for `id` at `position` (or append) and set its own position in `patch`. */
async function placeAmongSiblings(tx: Tx, id: string, listId: string, position: number | undefined, patch: Partial<Item>) {
  const siblings = await tx
    .select({ id: items.id })
    .from(items)
    .where(and(eq(items.listId, listId), isNull(items.parentItemId), itemIsLive, ne(items.id, id)))
    .orderBy(asc(items.position), asc(items.createdAt));
  const at = position == null ? siblings.length : Math.max(0, Math.min(position, siblings.length));
  const order = [...siblings.slice(0, at).map((s) => s.id), id, ...siblings.slice(at).map((s) => s.id)];
  for (let i = 0; i < order.length; i++) {
    if (order[i] === id) patch.position = i;
    else await tx.update(items).set({ position: i }).where(eq(items.id, order[i]!));
  }
}

/**
 * Move an item to a list (same or another project) at a position among the destination's top-level items.
 * A linked destination role updates the Status atomically. Into another project the whole family travels
 * under the destination's rules (keys, labels, members, relations); `restore` is an Undo handing back what that took.
 */
export async function moveItem(id: string, { listId, position, restore }: MoveItemInput, actorId: string | null = null): Promise<MoveResult | null> {
  return db.transaction(async (tx) => {
    const family = await familyOf(tx, id);
    const cur = family[0];
    if (!cur) return null;
    const [dest] = await tx.select().from(lists).where(eq(lists.id, listId));
    if (!dest) return null;
    const destProject = dest.projectId ? (await tx.select().from(projects).where(eq(projects.id, dest.projectId)))[0] ?? null : null;
    const crossProject = dest.projectId !== cur.projectId || (!dest.projectId && dest.id !== cur.listId);

    const patch: Partial<Item> = { listId: dest.id, projectId: dest.projectId };
    const changed: MoveResult["changed"] = { list: dest.id !== cur.listId, project: crossProject, status: null, key: null, subitems: 0, labelsCreated: [], labelsRemoved: 0, assigneesRemoved: 0, watchersRemoved: 0, relationsRemoved: 0 };
    // Placing an item in a Done list is a literal Status change: it is done there, not a recurring occurrence.
    if (dest.id !== cur.listId && dest.statusRole && destProject?.linkStatuses && dest.statusRole !== cur.status) {
      changed.status = { from: cur.status, to: dest.statusRole };
      Object.assign(patch, statusChange(cur, dest.statusRole));
    }
    // A subitem leaving its parent's project becomes an item of its own there; its Undo nests it again.
    if (crossProject && cur.parentItemId) patch.parentItemId = null;
    const [parent] = crossProject && restore?.parentItemId ? await tx.select().from(items).where(eq(items.id, restore.parentItemId)) : [];
    if (parent && !parent.parentItemId && parent.listId === dest.id && !family.some((it) => it.id === parent.id)) {
      patch.parentItemId = parent.id;
      patch.position = position ?? 0;
    } else {
      // Position: shift the destination's top-level siblings to make room (or append).
      await placeAmongSiblings(tx, id, dest.id, position, patch);
    }

    let undo: MoveRestore | null = null;
    if (crossProject) {
      const ids = family.map((it) => it.id);
      undo = { keys: [], labels: [], assignees: [], watchers: [], relations: [], createdLabelIds: [], parentItemId: cur.parentItemId };
      const { keys, prefix } = await familyKeys(tx, family, destProject, restore);
      for (const it of family) {
        if (it.keyNumber != null && keys.get(it.id) !== it.keyNumber) undo.keys.push({ itemId: it.id, keyNumber: it.keyNumber });
        // One row at a time, so the destination's (project, key) index only ever sees final, distinct numbers.
        if (it.id !== id) await tx.update(items).set({ listId: dest.id, projectId: dest.projectId, keyNumber: keys.get(it.id) ?? null }).where(eq(items.id, it.id));
      }
      patch.keyNumber = keys.get(id) ?? null;
      if (prefix && patch.keyNumber !== cur.keyNumber) changed.key = `${prefix}-${patch.keyNumber}`;
      changed.subitems = family.length - 1;
      await carryLabels(tx, ids, dest.projectId, undo, changed);
      if (restore?.labels.length && dest.projectId) {
        const valid = new Set((await tx.select({ id: labels.id }).from(labels).where(and(eq(labels.projectId, dest.projectId), inArray(labels.id, restore.labels.map((l) => l.labelId))))).map((l) => l.id));
        const back = restore.labels.filter((l) => ids.includes(l.itemId) && valid.has(l.labelId));
        if (back.length) await tx.insert(itemLabels).values(back).onConflictDoNothing();
      }
      // Only labels the forward move created in the project being left, and only once nothing uses them.
      if (restore?.createdLabelIds.length && cur.projectId) {
        await tx.delete(labels).where(and(inArray(labels.id, restore.createdLabelIds), eq(labels.projectId, cur.projectId), sql`not exists (select 1 from ${itemLabels} where ${itemLabels.labelId} = ${labels.id})`));
      }
      // Assignees must be members; watchers must be able to read it. An Inbox belongs to its owner alone.
      const memberIds = new Set(dest.projectId ? (await tx.select({ userId: members.userId }).from(members).where(eq(members.projectId, dest.projectId))).map((m) => m.userId) : [dest.userId]);
      const canRead = (userId: string) => memberIds.has(userId) || (!!destProject && destProject.visibility !== "private");
      changed.assigneesRemoved = await carryPeople(tx, itemAssignees, ids, (u) => memberIds.has(u), undo.assignees, restore?.assignees);
      changed.watchersRemoved = await carryPeople(tx, itemWatchers, ids, canRead, undo.watchers, restore?.watchers);
      changed.relationsRemoved = await carryRelations(tx, ids, { projectId: dest.projectId, listId: dest.id }, undo, restore?.relations);
    }

    const [row] = await tx.update(items).set(patch).where(eq(items.id, id)).returning();
    // Subitems follow their parent's list.
    if (!crossProject) await tx.update(items).set({ listId: dest.id }).where(eq(items.parentItemId, id));
    if (dest.id !== cur.listId) {
      const [src] = await tx.select({ name: lists.name }).from(lists).where(eq(lists.id, cur.listId));
      const status = changed.status ? ` — Status set to ${changed.status.to}` : "";
      // Across projects each log names only its own project's lists: members of one may not see the other.
      if (crossProject) {
        await logActivity(tx, { projectId: cur.projectId, actorId, type: "item", text: `moved ${quote(cur.title)} from ${src?.name ?? "the Inbox"} to another project`, itemId: id, itemKey: keyOf(cur) });
        await logActivity(tx, { projectId: dest.projectId, actorId, type: "item", text: `moved ${quote(cur.title)} from another project to ${dest.name}${status}`, itemId: id, itemKey: keyOf(row!) });
      } else {
        await logActivity(tx, { projectId: dest.projectId, actorId, type: "item", text: `moved ${quote(cur.title)} from ${src?.name ?? "the Inbox"} to ${dest.name}${status}`, itemId: id, itemKey: keyOf(row!) });
      }
    }
    return { item: row!, changed, undo };
  });
}

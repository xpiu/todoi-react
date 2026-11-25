import type { CreateItemInput } from "../../shared/items";
import { applyCompletion, checkedMoveTarget, initialStatus, type CheckedMoveProject } from "../../shared/completion";
import type { ItemStatus } from "../../shared/item-status";
import type { Item } from "./api";

/** Where a create lands: the list (with its Status role) and the project the API files it in */
export interface CreateDestination {
  listId: string;
  projectId: string | null;
  statusRole: ItemStatus | null;
}

/** The new item on its own, by the API's rules (Status and done from the list's role); its place is optimisticCreate's. */
export function predictCreated(vars: CreateItemInput, dest: CreateDestination): Item {
  const now = new Date().toISOString();
  const state = initialStatus(vars.status === undefined ? dest.statusRole : vars.status);
  return {
    version: 0,
    id: vars.id,
    title: vars.title,
    listId: dest.listId,
    projectId: dest.projectId,
    parentItemId: vars.parentItemId ?? null,
    keyNumber: null,
    description: vars.description ?? null,
    ...state,
    priority: vars.priority ?? null,
    startDate: vars.startDate ?? null,
    dueDate: vars.dueDate ?? null,
    dueTime: vars.dueTime ?? null,
    repeatRule: null,
    repeatCount: 0,
    cover: null,
    notification: null,
    unread: false,
    priorListId: null,
    position: 0,
    createdBy: null,
    archivedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    labelIds: vars.labelIds ?? [],
    assigneeIds: vars.assigneeIds ?? [],
    attachmentCount: 0,
  };
}

/**
 * The item a create will produce, predicted by the API's own rules so nothing jumps when the refetch lands:
 * a Status from the list's role (and done in a Done list), and the place among the list's top-level
 * items (`placeAmongSiblings` on the server: top or end, siblings renumbered). Subitems go last.
 */
export function optimisticCreate(items: Item[], vars: CreateItemInput, dest: CreateDestination): Item[] {
  const item = predictCreated(vars, dest);
  if (vars.parentItemId) return [...items, { ...item, position: Math.max(-1, ...items.filter((it) => it.listId === dest.listId).map((it) => it.position)) + 1 }];
  const siblings = items.filter((it) => it.listId === dest.listId && !it.parentItemId).sort((x, y) => x.position - y.position || x.createdAt.localeCompare(y.createdAt));
  const at = vars.position === "top" ? 0 : siblings.length;
  const renumbered = new Map(siblings.map((it, i) => [it.id, i < at ? i : i + 1]));
  return [...items.map((it) => (renumbered.has(it.id) && it.position !== renumbered.get(it.id) ? { ...it, position: renumbered.get(it.id)! } : it)), { ...item, position: at }];
}

/**
 * An update predicted by the API's rules: the fields, then done / Status by the shared completion rules, and —
 * "Checked items move to Done" — a check that takes the item (and its subitems) to the end of the Done list,
 * or an uncheck that sends it back. `project` is the cached project detail; without it nothing moves.
 */
export function optimisticUpdate(items: Item[], id: string, changes: Partial<Item>, request: { done?: boolean; status?: ItemStatus | null; ifDue?: string }, project: CheckedMoveProject | null | undefined): Item[] {
  const cur = items.find((it) => it.id === id);
  if (!cur) return items;
  const next = { ...cur, ...changes };
  const updated: Item = { ...next, ...applyCompletion(next, request).patch };
  const to = request.done === undefined ? null : checkedMoveTarget(cur, updated.done, project);
  if (!to) return items.map((it) => (it.id === id ? updated : it));
  const end = Math.max(-1, ...items.filter((it) => it.listId === to && !it.parentItemId && it.id !== id).map((it) => it.position)) + 1;
  return items.map((it) => (it.id === id ? { ...updated, listId: to, priorListId: updated.done ? cur.listId : null, position: end } : it.parentItemId === id ? { ...it, listId: to } : it));
}

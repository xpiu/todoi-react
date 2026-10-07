import type { CreateItemInput } from "../../shared/items";
import { statusChange } from "../../shared/completion";
import type { ItemStatus } from "../../shared/item-status";
import type { Item } from "./api";

/**
 * The item a create will produce, predicted by the API's own rules so nothing jumps when the refetch lands:
 * a Status from the list's role (and done in a Done list), and the place among the list's top-level
 * items (`placeAmongSiblings` on the server: top or end, siblings renumbered). Subitems go last.
 */
export function optimisticCreate(items: Item[], vars: CreateItemInput, dest: { listId: string; projectId: string | null; statusRole: ItemStatus | null }): Item[] {
  const now = new Date().toISOString();
  const state = statusChange({ status: null, done: false, priorStatus: null }, vars.status === undefined ? dest.statusRole : vars.status);
  const item: Item = {
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
  if (vars.parentItemId) return [...items, { ...item, position: Math.max(-1, ...items.filter((it) => it.listId === dest.listId).map((it) => it.position)) + 1 }];
  const siblings = items.filter((it) => it.listId === dest.listId && !it.parentItemId).sort((x, y) => x.position - y.position || x.createdAt.localeCompare(y.createdAt));
  const at = vars.position === "top" ? 0 : siblings.length;
  const renumbered = new Map(siblings.map((it, i) => [it.id, i < at ? i : i + 1]));
  return [...items.map((it) => (renumbered.has(it.id) ? { ...it, position: renumbered.get(it.id)! } : it)), { ...item, position: at }];
}

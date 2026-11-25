// The actions every project view shares: quick-add, done, priority, move (keyboard and drag) with the
// undo toast, delete, and the bulk versions behind the BulkBar. Views only render; this hook talks to
// the data layer and the feedback store. Every undoable outcome raises exactly one toast.
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import type { ItemPriority } from "../../shared/enums";
import type { ItemStatus } from "../../shared/item-status";
import type { MoveRestore } from "../../shared/items";
import type { Item, Label } from "../data/api";
import { predictCreated } from "../data/itemOptimism";
import { keys } from "../data/queries";
import { useLabelMutations } from "../data/itemContent";
import { newId, scopeOf, useCreateItem, useCreateList, useDeleteItem, useDuplicateItem, useMoveItem, useRestoreItem, useSetItemAssignees, useSetItemLabels, useUpdateItem, useUpdateList } from "../data/mutations";
import { listIconFor } from "../design/board/listIcons";
import { daysBetweenISO, formatDate, formatDateRange, formatTime, shiftISO } from "../design/core/dates";
import type { DatesValue } from "../design/core/DatesPicker";
import type { LabelDraft, PickableLabel } from "../design/core/LabelPicker";
import type { DropTarget } from "../design/board/useItemDnd";
import type { BulkAction, BulkOption } from "../design/core/BulkBar";
import { statusMovesItem, statusPick } from "../design/core/itemFields";
import { PRIORITY_COLORS } from "../design/core/priorities";
import type { QuickAddResult } from "../design/core/quickAdd";
import type { ItemAction } from "../design/core/shortcuts";
import { STATUSES } from "../design/core/statuses";
import { count, joinAnd } from "../design/core/text";
import { snapshotUndo } from "./snapshotUndo";
import { useCompletion } from "./completion";
import { withPreset, type GroupPatch } from "./groups";
import { quote, useFeedback } from "./feedback";
import { keyOf, PRIORITY_LABEL, type Person } from "./items";
import { usePrefs } from "./prefs";
import { peopleOf, type ItemContainer } from "./session";

const PRIORITIES: ItemPriority[] = ["URGENT", "HIGH", "MEDIUM", "LOW"];
const statusName = (id: string | null | undefined) => STATUSES.find((s) => s.id === id)?.name ?? "None";
const emptyRestore = (): MoveRestore => ({ keys: [], labels: [], assignees: [], watchers: [], relations: [], createdLabelIds: [] });
/** The selected items without a selected parent: a subitem travels with its selected parent. */
function rootsOf(sel: Item[]): Item[] {
  const picked = new Set(sel.map((it) => it.id));
  return sel.filter((it) => !it.parentItemId || !picked.has(it.parentItemId));
}
/** "label “Design” added" / "2 labels added" when a move or copy made labels in the destination. */
const labelsAdded = (names: string[]) => (names.length === 1 ? `label ${quote(names[0]!)} added` : names.length ? `${count(names.length, "label")} added` : null);
/**
 * Run a request per item, one after another; each failure reports itself and only finished ones come back.
 * Null when nothing finished, or when the screen changed meanwhile (its toast and Undo belong elsewhere).
 */
async function inTurn<T>(items: Item[], run: (it: Item) => Promise<T>): Promise<Array<{ it: Item; result: T }> | null> {
  const undoScope = useFeedback.getState().scope;
  const done: Array<{ it: Item; result: T }> = [];
  for (const it of items) {
    try {
      done.push({ it, result: await run(it) });
    } catch { /* The mutation reports the request error. */ }
  }
  return done.length && useFeedback.getState().scope === undoScope ? done : null;
}
/** Fold one move's record into a running one (a subitem's own parent link is per item, so it stays out). */
function mergeRestore(into: MoveRestore, from: MoveRestore | null | undefined) {
  if (!from) return;
  for (const k of ["keys", "labels", "assignees", "watchers", "relations", "createdLabelIds"] as const) (into[k] as unknown[]).push(...from[k]);
}

export type ProjectActions = ReturnType<typeof useProjectActions>;

/** `projectId` null: the Inbox (with `inboxContainer`). */
export function useProjectActions(projectId: string | null, project: ItemContainer, items: Item[], labels: Label[]) {
  const scope = useMemo(() => scopeOf(projectId), [projectId]);
  const createItem = useCreateItem(scope);
  const updateItem = useUpdateItem(scope);
  const completion = useCompletion(scope);
  const moveItem = useMoveItem(scope);
  const deleteItem = useDeleteItem(scope);
  const deleteOne = deleteItem.mutateAsync;
  const duplicateItem = useDuplicateItem(scope);
  const qc = useQueryClient();
  const restoreItem = useRestoreItem(scope);
  const restoreOne = restoreItem.mutateAsync;
  const setLabels = useSetItemLabels(scope);
  const setAssignees = useSetItemAssignees(scope);
  const createList = useCreateList(projectId ?? "");
  const updateList = useUpdateList(projectId ?? "");
  const notify = useFeedback((s) => s.notify);
  const announce = useFeedback((s) => s.announce);
  const lists = useMemo(() => project.lists.filter((l) => !l.hidden), [project.lists]);
  const hiddenLists = useMemo(() => project.lists.filter((l) => l.hidden), [project.lists]);
  const members = project.members;
  const people: Person[] = useMemo(() => peopleOf({ members }), [members]);
  const listName = (id: string) => project.lists.find((l) => l.id === id)?.name ?? "the list";
  const byId = (id: string) => items.find((x) => x.id === id);
  /** A top-level item's index among its list's items — what a move's `position` means (stored positions can have gaps). */
  const rankOf = (it: Item) => (it.parentItemId ? it.position : items.filter((x) => x.listId === it.listId && !x.parentItemId).sort((a, b) => a.position - b.position).findIndex((x) => x.id === it.id));

  // Moving back only rewrites Status when the original list has a linked role.
  const moveSnapshot = (before: Item, after: Item) => {
    const role = project.linkStatuses ? project.lists.find((l) => l.id === before.listId)?.statusRole : null;
    return { before: { position: rankOf(before), listId: before.listId, projectId: before.projectId, ...(before.parentItemId ? { parentItemId: before.parentItemId } : {}), ...(role ? { status: role } : {}) }, after: { position: after.position, listId: after.listId, projectId: after.projectId, ...(before.parentItemId ? { parentItemId: after.parentItemId } : {}), ...(role ? { status: after.status } : {}) } };
  };

  const smartDates = usePrefs((s) => s.smartDates);
  const defaultPriority = usePrefs((s) => s.defaultPriority);
  /** Settings › Default priority, unless quick-add set one. */
  const priorityOf = (parsed?: Pick<QuickAddResult, "priority">): ItemPriority | undefined => (parsed?.priority ? (parsed.priority.toUpperCase() as ItemPriority) : defaultPriority === "none" ? undefined : defaultPriority);
  const quickAdd = useMemo(
    () => ({ labels: labels.map((l) => ({ text: l.name, color: l.color })), members: people.map((p) => ({ name: p.name, nickname: p.nickname ?? undefined })), lists: project.lists.map((l) => ({ name: l.name, value: l.id })), dates: smartDates }),
    [labels, project.lists, people, smartDates],
  );

  /**
   * Quick-add. In a Group by group, `group.preset` is the group's value (groupPreset), sent in the same create request:
   * what the field typed wins for one-value fields (priority, due, >list), labels and assignees add up. A Status in a
   * linked project picks the list with that role, as a Status pick does. No toast when the item shows where it was typed;
   * `group.notice` says, from the predicted item, when it won't (groupAddNotice): then one toast with Undo.
   */
  const addItem = (listId: string, title: string, parsed: QuickAddResult, position: "top" | "bottom" = "bottom", group?: { preset: GroupPatch | null; notice: (predicted: Item) => string | null }) => {
    const preset = group?.preset;
    const linked = statusMovesItem(lists, project.linkStatuses, listId);
    const pick = preset && "status" in preset ? statusPick(preset.status, { lists, movesItem: linked, listId, recurring: false }) : null;
    const typedList = parsed.list ? project.lists.find((l) => l.name === parsed.list)?.id : undefined;
    const destination = typedList ?? (pick && "moveTo" in pick ? pick.moveTo : listId);
    // In a linked project the list's role is the Status, a typed >list's included.
    const status = pick && "status" in pick && !(linked && typedList) ? (pick.status ?? undefined) : undefined;
    const labelIds = parsed.labels.map((pl) => labels.find((l) => l.name.toLowerCase() === pl.text.toLowerCase())?.id).filter((id): id is string => !!id);
    const assigneeIds = parsed.assignee ? people.filter((p) => p.name === parsed.assignee).map((p) => p.id) : [];
    const fields = withPreset({ priority: priorityOf(parsed), dueDate: parsed.due ?? undefined, labelIds, assigneeIds }, preset, !!parsed.priority);
    const vars = { id: newId(), title, listId: destination, status, ...fields, position };
    createItem.mutate(vars);
    const notice = group?.notice(predictCreated(vars, { listId: destination, projectId, statusRole: project.lists.find((l) => l.id === destination)?.statusRole ?? null }));
    if (notice) notify({ message: `${notice} · ${quote(title)}`, icon: "plus", restore: () => deleteOne({ id: vars.id, quiet: true }) });
  };

  /** Move with the undo toast for cross-list moves; same-list reorders only tell screen readers where the item landed. */
  const move = (id: string, target: DropTarget) => {
    const it = byId(id);
    if (!it) return;
    const from = { listId: it.listId, position: rankOf(it) };
    const crossList = target.listId !== it.listId;
    moveItem.mutate(
      { id, listId: target.listId, position: target.position },
      {
        onSuccess: (result) => {
          if (!crossList) {
            const siblings = items.filter((x) => x.listId === it.listId && !x.parentItemId).length;
            announce(`Moved ${quote(it.title)} to position ${Math.min(target.position, siblings - 1) + 1} of ${siblings} in ${listName(it.listId)}`);
            return;
          }
          const status = result.changed.status ? ` — Status set to ${statusName(result.changed.status.to)}` : "";
          const base = `Moved ${quote(it.title)} to ${listName(target.listId)}`;
          notify({ message: base + status, history: base, icon: "arrow-right", restore: snapshotUndo([{ id, ...moveSnapshot(it, result.item), restore: () => moveItem.mutateAsync({ id, listId: from.listId, position: from.position, quiet: true }) }]) });
        },
      },
    );
  };

  const onMoveItemKey = (id: string, dir: "up" | "down" | "left" | "right") => {
    const it = byId(id);
    if (!it) return;
    const order = lists.map((l) => l.id);
    const li = order.indexOf(it.listId);
    if (dir === "left" || dir === "right") {
      const target = order[li + (dir === "left" ? -1 : 1)];
      if (target) move(id, { listId: target, position: rankOf(it) });
    } else move(id, { listId: it.listId, position: Math.max(0, rankOf(it) + (dir === "up" ? -1 : 1)) });
  };

  const removeMany = useCallback(async (ids: string[], noun = "item") => {
    // Read at the action boundary, so a stable callback always uses the current optimistic data.
    const current = new Map((qc.getQueryData<Item[]>(keys.items(scope)) ?? []).map((it) => [it.id, it]));
    const selected = [...new Set(ids)].map((id) => current.get(id)).filter((it): it is Item => !!it);
    const undoScope = useFeedback.getState().scope;
    const removed: Item[] = [];
    // Serial deletion keeps one failed request from rolling back another deletion's cache patch.
    for (const it of selected) {
      try {
        await deleteOne({ id: it.id });
        removed.push(it);
      } catch { /* The mutation reports the request error; only successful deletes become undoable. */ }
    }
    if (!removed.length || useFeedback.getState().scope !== undoScope) return;
    const pending = removed.map((it) => it.id);
    notify({
      message: `Deleted ${removed.length === 1 ? quote(removed[0]!.title) : count(removed.length, noun)}`,
      meta: removed.length < selected.length ? `${selected.length - removed.length} could not be deleted` : undefined,
      icon: "trash-2",
      restore: async () => {
        // Retain only unfinished work if a bulk restore fails midway through.
        while (pending.length) {
          await restoreOne({ id: pending[0]!, quiet: true });
          pending.shift();
        }
      },
    });
  }, [qc, scope, deleteOne, restoreOne, notify]);
  const remove = useCallback((id: string) => removeMany([id]), [removeMany]);

  /** Done toggle; a recurring item moves to its next due instead (the API decides; one undoable toast). */
  const setDone = (id: string, done: boolean) => {
    const it = byId(id);
    if (it) void completion.setDone(it, done);
  };

  const onItemKey = (id: string, action: ItemAction) => {
    const it = byId(id);
    if (!it) return;
    if (action === "done") setDone(id, !it.done);
    else if (action === "delete") remove(id);
    else if (action.startsWith("priority-")) {
      const n = Number(action.slice(9));
      updateItem.mutate({ id, priority: n === 0 ? null : PRIORITIES[n - 1]! });
    }
  };

  /** One field edit with its undoable toast (a Board quick pick, a calendar drop): the toast follows the server's answer. */
  const editWithUndo = (id: string, before: Record<string, unknown>, after: Record<string, unknown>, message: string, icon: "clock" | "flag" | "circle-dot" | "calendar" | "calendar-off") =>
    updateItem.mutate({ id, ...after }, { onSuccess: () => notify({ message, icon, restore: snapshotUndo([{ id, before, after, restore: () => updateItem.mutateAsync({ id, ...before, quiet: true }) }]) }) });

  /** Calendar drop: the item's start and due move together by the days dragged (a range keeps its length); one Undo. */
  const reschedule = (id: string, from: string, to: string) => {
    const it = byId(id);
    const n = daysBetweenISO(from, to);
    if (!it || !it.dueDate || !n) return;
    const next = { startDate: shiftISO(it.startDate, n), dueDate: shiftISO(it.dueDate, n) };
    editWithUndo(id, { startDate: it.startDate, dueDate: it.dueDate }, next, `Moved ${quote(it.title)} to ${formatDateRange(next.startDate, next.dueDate, null, { year: "auto" })}`, "calendar");
  };
  /** Calendar "No date" tray → a day: the item gets that due date (a later start moves back to it, as in the Dates picker); one Undo. */
  const schedule = (id: string, due: string) => {
    const it = byId(id);
    if (!it || it.dueDate === due) return;
    const next = { startDate: it.startDate && it.startDate > due ? due : it.startDate, dueDate: due };
    editWithUndo(id, { startDate: it.startDate, dueDate: it.dueDate }, next, `Due date set to ${formatDate(due, { weekday: true, year: "auto" })} · ${quote(it.title)}`, "calendar");
  };
  /** Calendar chip → the "No date" tray: the due date and its time go, the start stays; one Undo. */
  const clearDue = (id: string) => {
    const it = byId(id);
    if (!it?.dueDate) return;
    editWithUndo(id, { dueDate: it.dueDate, dueTime: it.dueTime }, { dueDate: null, dueTime: null }, `Due date cleared · ${quote(it.title)}`, "calendar-off");
  };

  /** Calendar "+": a fresh item due that day in the first list, undoable (the overlay then names it). */
  const addItemOn = (iso: string) => {
    const list = lists[0];
    if (!list) return;
    const id = newId();
    createItem.mutate({ id, title: "New item", listId: list.id, dueDate: iso, priority: priorityOf() });
    notify({ message: `Added an item due ${formatDate(iso, { year: "auto" })} to ${list.name}`, icon: "plus", restore: () => deleteItem.mutate({ id }) });
  };

  /**
   * Copy items, each with its subitems, into a list (this project's, another's or the Inbox): the API copies
   * one family at a time in full or not at all. One toast says what came along and what stayed with the
   * originals; one Undo removes the copies.
   */
  const copyItems = async (ids: string[], dest: { projectId: string | null; listId: string; name: string | null }) => {
    const roots = rootsOf(ids.map(byId).filter((it): it is Item => !!it));
    const made = await inTurn(roots, (it) => duplicateItem.mutateAsync({ sourceId: it.id, id: newId(), listId: dest.listId, toProjectId: dest.projectId }));
    if (!made) return;
    const sum = (k: "subitems" | "labelsDropped" | "assigneesDropped") => made.reduce((n, m) => n + m.result.report[k], 0);
    const left = (k: "comments" | "attachments" | "relations") => made.reduce((n, m) => n + m.result.report.left[k], 0);
    const behind = ([["comments", "comment"], ["attachments", "file"], ["relations", "link"]] as const).filter(([k]) => left(k)).map(([k, word]) => count(left(k), word));
    const changes = [
      labelsAdded([...new Set(made.flatMap((m) => m.result.report.labelsCreated))]),
      sum("labelsDropped") ? `${count(sum("labelsDropped"), "label")} left off` : null,
      sum("assigneesDropped") ? `${count(sum("assigneesDropped"), "non-member")} not assigned` : null,
    ].filter(Boolean).join(", ");
    const one = left("comments") + left("attachments") + left("relations") === 1;
    const stays = behind.length ? `${joinAnd(behind)} stay${one ? "s" : ""} with the original${made.length > 1 ? "s" : ""}` : "";
    const details = [changes, stays].filter(Boolean).join("; ");
    const what = made.length === 1 ? quote(made[0]!.it.title) : count(made.length, "item");
    const verb = dest.name ? "Copied" : "Duplicated";
    const where = dest.name ? ` to ${dest.name}` : "";
    const subitems = sum("subitems");
    // Undo needs only the copies' ids.
    const copies = made.map((m) => m.result.items[0]!.id);
    notify({
      message: `${verb} ${what}${subitems ? ` with ${count(subitems, "subitem")}` : ""}${where}${details ? ` — ${details}` : ""}`,
      history: `${verb} ${what}${where}`,
      meta: made.length < roots.length ? `${roots.length - made.length} not copied` : undefined,
      icon: "copy",
      restore: async () => {
        // One at a time, so a failed Undo retries only the copies still there.
        while (copies.length) {
          await deleteItem.mutateAsync({ id: copies[0]!, quiet: true });
          copies.shift();
        }
        if (dest.projectId !== projectId) await qc.invalidateQueries({ queryKey: dest.projectId ? keys.items({ projectId: dest.projectId }) : ["items"] });
      },
    });
  };

  /** Move or copy items to a list in another project: one undo toast; a copy gets new keys. */
  const transfer = async (ids: string[], target: { id: string; name: string }, list: { id: string; name: string }, copy: boolean) => {
    const dest = `${target.name} › ${list.name}`;
    if (copy) return copyItems(ids, { projectId: target.id, listId: list.id, name: dest });
    // Subitems travel with a selected parent; one at a time, so relations between moved items survive.
    const roots = rootsOf(ids.map(byId).filter((x): x is Item => !!x));
    const carried = emptyRestore();
    const moved = await inTurn(roots, async (it) => {
      const result = await moveItem.mutateAsync({ id: it.id, listId: list.id, toProjectId: target.id, restore: carried.relations.length ? { ...emptyRestore(), relations: carried.relations } : undefined });
      mergeRestore(carried, result.undo);
      return result;
    });
    if (!moved) return;
    // What the destination changed, in the message (it wraps); the history keeps the short form.
    const keyed = moved.filter((m) => m.result.changed.key);
    const sum = (k: "subitems" | "labelsRemoved" | "assigneesRemoved" | "watchersRemoved" | "relationsRemoved") => moved.reduce((n, m) => n + m.result.changed[k], 0);
    const details = [
      keyed.length === 1 && moved.length === 1 ? `now ${keyed[0]!.result.changed.key}` : keyed.length ? count(keyed.length, "new key") : null,
      labelsAdded([...new Set(moved.flatMap((m) => m.result.changed.labelsCreated))]),
      sum("labelsRemoved") ? `${count(sum("labelsRemoved"), "label")} removed` : null,
      sum("assigneesRemoved") ? `${count(sum("assigneesRemoved"), "non-member")} unassigned` : null,
      sum("watchersRemoved") ? `${count(sum("watchersRemoved"), "watcher")} without access removed` : null,
      sum("relationsRemoved") ? `${count(sum("relationsRemoved"), "relation")} to items left behind removed` : null,
    ].filter(Boolean).join(", ");
    const subitems = sum("subitems");
    const what = moved.length === 1 ? quote(moved[0]!.it.title) : count(moved.length, "item");
    const base = `Moved ${what} to ${dest}`;
    // Back in original order, each handing back what the move took; relations rejoin once both ends are home.
    const back = moved.map((m) => ({ ...m, at: rankOf(m.it) })).sort((a, b) => a.at - b.at);
    notify({
      message: `Moved ${what}${subitems ? ` and ${count(subitems, "subitem")}` : ""} to ${dest}${details ? ` — ${details}` : ""}`,
      history: base,
      meta: moved.length < roots.length ? `${roots.length - moved.length} not moved` : undefined,
      icon: "folder-input",
      restore: snapshotUndo(back.map(({ it, at, result: forward }) => ({
        id: it.id,
        ...moveSnapshot(it, forward.item),
        restore: async () => {
          const result = await moveItem.mutateAsync({ id: it.id, listId: it.listId, position: at, toProjectId: projectId, restore: { ...carried, parentItemId: forward.undo?.parentItemId ?? null }, quiet: true });
          mergeRestore(carried, { ...emptyRestore(), relations: result.undo?.relations ?? [] });
        },
      }))),
    });
  };

  const addList = (name?: string, statusRole?: ItemStatus | null) => createList.mutate({ id: newId(), name: name ?? `List ${project.lists.length + 1}`, statusRole: statusRole ?? undefined });

  /** Hiding is project-wide (shared project data), so the toast says so and Undo shows it again. */
  const hideList = (listId: string) =>
    updateList.mutate(
      { id: listId, hidden: true },
      { onSuccess: () => notify({ message: `Hid ${quote(listName(listId))} for everyone in this project`, history: `Hid ${quote(listName(listId))}`, icon: "eye-off", restore: () => updateList.mutateAsync({ id: listId, hidden: false, quiet: true }).then(() => undefined) }) },
    );
  const showLists = (ids: string[]) => ids.forEach((id) => updateList.mutate({ id, hidden: false }));
  /** Set a list's Status role; `applyToExisting` also sets it on the list's live items in the same request. */
  const setListRole = (listId: string, statusRole: ItemStatus | null, applyToExisting = false) =>
    updateList.mutate(
      { id: listId, statusRole, ...(applyToExisting ? { applyToExisting } : {}) },
      { onSuccess: (r) => { if (applyToExisting) notify({ message: `Set ${count(r.rewritten, "item")} in ${quote(listName(listId))} to ${statusName(statusRole)}`, icon: "milestone" }); } },
    );

  /** The BulkBar's actions for the current selection. */
  /** The Move to choices (BulkBar, a board card's ⋯): this project's visible lists, then another project. */
  const moveOptions = useCallback((currentListId?: string): BulkOption[] => [...lists.map((l) => ({ value: l.id, label: l.name, checked: l.id === currentListId, icon: listIconFor(l.name).icon, iconColor: listIconFor(l.name).color })), { value: null, label: "", divider: true }, { value: "__move", label: "Move to another project…", icon: "folder-input" }, { value: "__copy", label: "Copy to another project…", icon: "folder-output" }], [lists]);
  const bulkActions = (selectedIds: string[]): BulkAction[] => {
    const sel = selectedIds.map(byId).filter((x): x is Item => !!x);
    return [
      { id: "move", label: "Move to", icon: "arrow-right", options: moveOptions() },
      { id: "priority", label: "Priority", icon: "flag", options: [...PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p], icon: "flag" as const, iconColor: PRIORITY_COLORS[PRIORITY_LABEL[p]] })), { value: null, label: "None", icon: "flag-off" }] },
      { id: "label", label: "Label", icon: "tag", options: labels.map((l) => ({ value: l.id, label: l.name, swatch: `var(--label-${l.color})`, checked: sel.length > 0 && sel.every((it) => it.labelIds.includes(l.id)) })) },
      { id: "assign", label: "Assign", icon: "user-plus", options: [...people.map((p) => ({ value: p.id, label: p.name, icon: "user" as const })), { value: null, label: "Unassigned", icon: "user-x" }] },
      { id: "done", label: sel.length && sel.every((it) => it.done) ? "Not done" : "Done", icon: "circle-check" },
      { id: "delete", label: "Delete", icon: "trash-2", danger: true },
    ];
  };

  /** One state change and one undo toast for every selected item. Returns true when the selection should clear. */
  const bulk = (action: string, value: string | null | undefined, selectedIds: string[]): boolean => {
    const sel = selectedIds.map(byId).filter((x): x is Item => !!x);
    if (!sel.length) return false;
    if (action === "delete") {
      void removeMany(selectedIds);
      return true;
    }
    if (action === "move" && value) {
      const end = items.filter((it) => it.listId === value && !it.parentItemId).length;
      void inTurn(sel, async (it) => ({ at: rankOf(it), forward: await moveItem.mutateAsync({ id: it.id, listId: value, position: end + sel.indexOf(it) }) })).then((moved) => {
        if (!moved) return;
        const dest = project.lists.find((l) => l.id === value);
        // "— Status set to Doing" only says something when the Status is not simply the list's own name
        const roleName = dest?.statusRole ? statusName(dest.statusRole) : null;
        const status = roleName && project.linkStatuses && roleName.toLowerCase() !== listName(value).toLowerCase() ? ` — ${moved.length === 1 ? "Status" : "Statuses"} set to ${roleName}` : "";
        const base = `Moved ${moved.length === 1 ? quote(moved[0]!.it.title) : count(moved.length, "item")} to ${listName(value)}`;
        notify({ message: base + status, history: base, icon: "arrow-right", restore: snapshotUndo([...moved].reverse().map(({ it, result }) => ({ id: it.id, ...moveSnapshot(it, result.forward.item), restore: () => moveItem.mutateAsync({ id: it.id, listId: it.listId, position: result.at, quiet: true }) }))) });
      });
      return true;
    }
    if (action === "priority") {
      const p = (value as ItemPriority | null) ?? null;
      void inTurn(sel, (it) => updateItem.mutateAsync({ id: it.id, priority: p })).then((done) => {
        if (!done) return;
        const noun = count(done.length, "item");
        notify({ message: p ? `Set priority ${PRIORITY_LABEL[p]} on ${noun}` : `Cleared priority on ${noun}`, icon: "flag", restore: snapshotUndo(done.map(({ it, result }) => ({ id: it.id, before: { priority: it.priority }, after: { priority: result.priority }, restore: () => updateItem.mutateAsync({ id: it.id, priority: it.priority, quiet: true }) }))) });
      });
    } else if (action === "label" && value) {
      const label = labels.find((l) => l.id === value);
      if (!label) return false;
      const allHave = sel.every((it) => it.labelIds.includes(value));
      void inTurn(sel, (it) => setLabels.mutateAsync({ id: it.id, labelIds: allHave ? it.labelIds.filter((x) => x !== value) : [...it.labelIds.filter((x) => x !== value), value] })).then((done) => {
        if (!done) return;
        notify({ message: `${allHave ? "Removed" : "Added"} the label ${label.name} ${allHave ? "from" : "to"} ${count(done.length, "item")}`, icon: "tag", restore: snapshotUndo(done.map(({ it, result }) => ({ id: it.id, before: { labelIds: it.labelIds }, after: { labelIds: result.labelIds }, restore: () => setLabels.mutateAsync({ id: it.id, labelIds: it.labelIds }) }))) });
      });
    } else if (action === "assign") {
      void inTurn(sel, (it) => setAssignees.mutateAsync({ id: it.id, userIds: value ? [value] : [] })).then((done) => {
        if (!done) return;
        const noun = count(done.length, "item");
        const who = people.find((p) => p.id === value);
        notify({ message: who ? `Assigned ${noun} to ${who.name.split(" ")[0]}` : `Unassigned ${noun}`, icon: "user-plus", restore: snapshotUndo(done.map(({ it, result }) => ({ id: it.id, before: { assigneeIds: it.assigneeIds }, after: { assigneeIds: result.userIds }, restore: () => setAssignees.mutateAsync({ id: it.id, userIds: it.assigneeIds }) }))) });
      });
    } else if (action === "done") {
      void completion.setDoneMany(sel, !sel.every((it) => it.done));
    }
    return false;
  };

  const rename = (id: string, title: string) => updateItem.mutate({ id, title });
  /** Archive one item; the toast brings it back (the overlay ⋯ and a board card's ⋯) */
  const archive = (it: Item) => {
    updateItem.mutate({ id: it.id, archived: true });
    notify({ message: `Archived ${quote(it.title)}`, icon: "archive", restore: () => updateItem.mutateAsync({ id: it.id, archived: false, quiet: true }) });
  };
  /** Turn an item into a subitem of another (its key stays, it joins the parent's list). Undo makes it an item again in
   *  the list and place it had. The toast follows the server's answer: a refused nesting (409) shows only the reason. */
  const makeSubitemOf = (it: Item, parent: { id: string; itemId?: string; title: string }) => {
    const parentList = byId(parent.id)?.listId ?? it.listId;
    const moved = parentList !== it.listId;
    void updateItem.mutateAsync({ id: it.id, parentItemId: parent.id }).then(
      () =>
        notify({
          message: `${quote(it.title)} is now a subitem of ${quote(parent.title)}${moved ? ` in ${listName(parentList)}` : ""}`,
          icon: "corner-down-right",
          restore: snapshotUndo([
            {
              id: it.id,
              before: { parentItemId: null, listId: it.listId },
              after: { parentItemId: parent.id, listId: parentList },
              restore: async () => {
                await updateItem.mutateAsync({ id: it.id, parentItemId: null, quiet: true });
                if (moved) await moveItem.mutateAsync({ id: it.id, listId: it.listId, position: it.position, quiet: true });
              },
            },
          ]),
        }),
      () => {},
    );
  };

  /** A parent's subitems in their order */
  const subitemsOf = (parentId: string) => items.filter((x) => x.parentItemId === parentId).sort((a, b) => a.position - b.position);
  /** Put a subitem at `index` among its parent's subitems (positions rewritten in order; quiet, like a same-list reorder) */
  const reorderSubitem = (parentId: string, id: string, index: number) => {
    const order = subitemsOf(parentId).filter((s) => s.id !== id);
    const sub = byId(id);
    if (!sub) return;
    order.splice(Math.max(0, Math.min(index, order.length)), 0, sub);
    order.forEach((s, i) => s.position !== i && updateItem.mutate({ id: s.id, position: i }));
  };
  /**
   * A subitem under another item (the overlay checklist's ⋯ › Move to another item, a List view drag onto an item's row or
   * between its subitems): one toast with Undo; `index` places it among the new parent's subitems (default: last).
   */
  const moveSubitem = (id: string, parentId: string, index?: number) => {
    const sub = byId(id);
    const target = byId(parentId);
    if (!sub || !target || !sub.parentItemId) return;
    if (sub.parentItemId === parentId) {
      if (index != null) reorderSubitem(parentId, id, index);
      return;
    }
    const from = sub.parentItemId;
    const siblings = subitemsOf(parentId);
    void updateItem.mutateAsync({ id, parentItemId: parentId }).then(
      () => {
        if (index != null && index < siblings.length) [...siblings.slice(0, index), sub, ...siblings.slice(index)].forEach((s, i) => updateItem.mutate({ id: s.id, position: i }));
        notify({ message: `Moved ${quote(sub.title)} under ${keyOf(target, project.keyPrefix) ?? quote(target.title)}`, icon: "corner-down-right", restore: snapshotUndo([{ id, before: { parentItemId: from, listId: sub.listId }, after: { parentItemId: parentId, listId: target.listId }, restore: () => updateItem.mutateAsync({ id, parentItemId: from, quiet: true }) }]) });
      },
      () => {},
    );
  };

  /** The LabelPicker's create / edit / delete, for the overlay and the Board's quick pickers */
  const labelOps = useLabelMutations(projectId ?? "");
  const labelHandlers = {
    onCreateLabel: (d: LabelDraft) => labelOps.create.mutateAsync({ name: d.name, color: d.color }),
    onEditLabel: (l: PickableLabel, d: LabelDraft) => labelOps.update.mutate({ id: l.id, name: d.name, color: d.color }),
    onDeleteLabel: (l: PickableLabel) => labelOps.remove.mutate({ id: l.id }),
  };

  const firstName = (userId: string) => {
    const p = people.find((x) => x.id === userId);
    return p ? (p.nickname || p.name.split(" ")[0]) : "someone";
  };
  /**
   * The Board's quick pickers (CardQuickEdit): one toast with Undo per single pick (dates, priority, Status), and one per
   * labels or assignees session, raised when the picker closes. A Status pick in a linked project is a move (its own toast).
   */
  const quickEdit = {
    setDates: (id: string, next: DatesValue, prev: DatesValue) => {
      const day = (v: string) => formatDate(v, { weekday: true, year: "auto" });
      const message =
        !next.due && !next.start && prev.due && prev.start ? "Dates cleared"
        : next.due !== prev.due ? (next.due ? `Due date set to ${day(next.due)}` : "Due date cleared")
        : next.start !== prev.start ? (next.start ? `Start date set to ${day(next.start)}` : "Start date cleared")
        : next.time ? `Due time set to ${formatTime(next.time)}` : "Due time cleared";
      editWithUndo(id, { startDate: prev.start, dueDate: prev.due, dueTime: prev.time }, { startDate: next.start, dueDate: next.due, dueTime: next.time }, message, "clock");
    },
    setPriority: (id: string, next: ItemPriority | null, prev: ItemPriority | null) => editWithUndo(id, { priority: prev }, { priority: next }, next ? `Priority set to ${PRIORITY_LABEL[next]}` : "Priority cleared", "flag"),
    setStatus: (id: string, next: ItemStatus | null, prev: ItemStatus | null) => {
      const it = byId(id);
      // Done on a recurring item completes its occurrence (the completion toast); any other Status is set as given.
      if (next === "DONE" && it?.repeatRule && it.dueDate) return setDone(id, true);
      editWithUndo(id, { status: prev }, { status: next }, next ? `Status set to ${statusName(next)}` : "Status cleared", "circle-dot");
    },
    /** To the end of the list, with the move's own toast ("— Status set to Doing"): one move, one Undo */
    moveToList: (id: string, listId: string) => move(id, { listId, position: items.filter((x) => x.listId === listId && !x.parentItemId).length }),
    setLabels: (id: string, labelIds: string[]) => setLabels.mutate({ id, labelIds }),
    setAssignees: (id: string, userIds: string[]) => setAssignees.mutate({ id, userIds }),
    endSession: (id: string, field: "labels" | "assignees", before: string[], after: string[]) => {
      if (field === "labels") {
        const names = after.map((l) => labels.find((x) => x.id === l)?.name).filter(Boolean);
        notify({ message: names.length ? `Labels: ${names.join(", ")}` : "Labels cleared", icon: "tag", restore: snapshotUndo([{ id, before: { labelIds: before }, after: { labelIds: after }, restore: () => setLabels.mutateAsync({ id, labelIds: before }) }]) });
      } else {
        notify({ message: after.length ? `Assigned to ${after.map(firstName).join(", ")}` : "Assignees cleared", icon: "user-plus", restore: snapshotUndo([{ id, before: { assigneeIds: before }, after: { assigneeIds: after }, restore: () => setAssignees.mutateAsync({ id, userIds: before }) }]) });
      }
    },
  };

  /**
   * Group by: an item dropped on (or Ctrl/Cmd+Shift+↑↓-moved to) another group changes that one field — one toast with
   * Undo, "Priority set to High · “Pricing page”". A Status in a linked project is a move to that Status's list (the
   * move's own toast); Done on a recurring item completes its occurrence. Today as a due date pulls a later start date
   * along, so the range stays valid.
   */
  const groupMove = (id: string, patch: GroupPatch, message: string) => {
    const it = byId(id);
    if (!it) return;
    const text = `${message} · ${quote(it.title)}`;
    if ("status" in patch) {
      const pick = statusPick(patch.status, { lists, movesItem: statusMovesItem(lists, project.linkStatuses, it.listId), listId: it.listId, recurring: !!(it.repeatRule && it.dueDate) });
      if ("moveTo" in pick) return quickEdit.moveToList(id, pick.moveTo);
      if (pick.status === "DONE" && it.repeatRule && it.dueDate) return setDone(id, true);
      return editWithUndo(id, { status: it.status }, { status: pick.status }, text, "circle-dot");
    }
    if ("priority" in patch) return editWithUndo(id, { priority: it.priority }, { priority: patch.priority }, text, "flag");
    if ("dueDate" in patch) {
      const due = patch.dueDate;
      const startDate = due && it.startDate && it.startDate > due ? due : it.startDate;
      return editWithUndo(id, { startDate: it.startDate, dueDate: it.dueDate, dueTime: it.dueTime }, { startDate, dueDate: due }, text, "clock");
    }
    if ("labelIds" in patch) {
      const before = it.labelIds;
      return setLabels.mutate({ id, labelIds: patch.labelIds }, { onSuccess: () => notify({ message: text, icon: "tag", restore: snapshotUndo([{ id, before: { labelIds: before }, after: { labelIds: patch.labelIds }, restore: () => setLabels.mutateAsync({ id, labelIds: before }) }]) }) });
    }
    const before = it.assigneeIds;
    setAssignees.mutate({ id, userIds: patch.assigneeIds }, { onSuccess: () => notify({ message: text, icon: "user-plus", restore: snapshotUndo([{ id, before: { assigneeIds: before }, after: { assigneeIds: patch.assigneeIds }, restore: () => setAssignees.mutateAsync({ id, userIds: before }) }]) }) });
  };

  return { labelHandlers, quickEdit, groupMove, reorderSubitem, moveSubitem, lists, hiddenLists, hideList, showLists, setListRole, people, quickAdd, priorityOf, addItem, move, onMoveItemKey, onItemKey, remove, removeMany, setDone, addList, updateList, createList, bulkActions, moveOptions, bulk, reschedule, schedule, clearDue, addItemOn, archive, makeSubitemOf, transfer, copyItems, rename };
}

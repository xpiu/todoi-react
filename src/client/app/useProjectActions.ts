// The actions every project view shares: quick-add, done, priority, move (keyboard and drag) with the
// undo toast, delete, and the bulk versions behind the BulkBar. Views only render; this hook talks to
// the data layer and the feedback store. Every undoable outcome raises exactly one toast.
import { useMemo } from "react";

import type { ItemPriority } from "../../shared/enums";
import type { ItemStatus } from "../../shared/item-status";
import type { MoveRestore } from "../../shared/items";
import type { Item, Label, MoveResult, ProjectDetail } from "../data/api";
import { newId, useCreateItem, useCreateList, useDeleteItem, useMoveItem, useRestoreItem, useSetItemAssignees, useSetItemLabels, useUpdateItem, useUpdateList } from "../data/mutations";
import { listIconFor } from "../design/board/listIcons";
import { formatDate } from "../design/core/dates";
import type { DropTarget } from "../design/board/useItemDnd";
import type { BulkAction } from "../design/core/BulkBar";
import type { QuickAddResult } from "../design/core/quickAdd";
import type { ItemAction } from "../design/core/shortcuts";
import { STATUSES } from "../design/core/statuses";
import { count } from "../design/core/text";
import { useCompletion } from "./completion";
import { quote, useFeedback } from "./feedback";
import { PRIORITY_LABEL, type Person } from "./items";
import { peopleOf } from "./session";

const PRIORITIES: ItemPriority[] = ["URGENT", "HIGH", "MEDIUM", "LOW"];
const PRIO_COLORS: Record<ItemPriority, string> = { URGENT: "var(--label-red)", HIGH: "var(--label-orange)", MEDIUM: "var(--label-yellow)", LOW: "var(--label-blue)" };
const statusName = (id: string | null | undefined) => STATUSES.find((s) => s.id === id)?.name ?? "None";
const emptyRestore = (): MoveRestore => ({ keys: [], labels: [], assignees: [], watchers: [], relations: [], createdLabelIds: [] });
/** Fold one move's record into a running one (a subitem's own parent link is per item, so it stays out). */
function mergeRestore(into: MoveRestore, from: MoveRestore | null | undefined) {
  if (!from) return;
  for (const k of ["keys", "labels", "assignees", "watchers", "relations", "createdLabelIds"] as const) (into[k] as unknown[]).push(...from[k]);
}

export type ProjectActions = ReturnType<typeof useProjectActions>;

export function useProjectActions(projectId: string, project: ProjectDetail, items: Item[], labels: Label[]) {
  const scope = useMemo(() => ({ projectId }), [projectId]);
  const createItem = useCreateItem(scope);
  const updateItem = useUpdateItem(scope);
  const completion = useCompletion(scope);
  const moveItem = useMoveItem(scope);
  const deleteItem = useDeleteItem(scope);
  const restoreItem = useRestoreItem(scope);
  const setLabels = useSetItemLabels(scope);
  const setAssignees = useSetItemAssignees(scope);
  const createList = useCreateList(projectId);
  const updateList = useUpdateList(projectId);
  const notify = useFeedback((s) => s.notify);
  const lists = project.lists.filter((l) => !l.hidden);
  const hiddenLists = project.lists.filter((l) => l.hidden);
  const people: Person[] = useMemo(() => peopleOf(project), [project]);
  const listName = (id: string) => project.lists.find((l) => l.id === id)?.name ?? "the list";
  const byId = (id: string) => items.find((x) => x.id === id);

  const quickAdd = useMemo(
    () => ({ labels: labels.map((l) => ({ text: l.name, color: l.color })), members: people.map((p) => ({ name: p.name, nickname: p.nickname ?? undefined })), lists: project.lists.map((l) => ({ name: l.name, value: l.id })) }),
    [labels, project.lists, people],
  );

  const addItem = (listId: string, title: string, parsed: QuickAddResult, position: "top" | "bottom" = "bottom") => {
    const destination = parsed.list ? (project.lists.find((l) => l.name === parsed.list)?.id ?? listId) : listId;
    const labelIds = parsed.labels.map((pl) => labels.find((l) => l.name.toLowerCase() === pl.text.toLowerCase())?.id).filter((id): id is string => !!id);
    const assigneeIds = parsed.assignee ? people.filter((p) => p.name === parsed.assignee).map((p) => p.id) : [];
    createItem.mutate({ id: newId(), title, listId: destination, priority: parsed.priority ? (parsed.priority.toUpperCase() as ItemPriority) : undefined, dueDate: parsed.due ?? undefined, labelIds, assigneeIds, position });
  };

  /** Move with the undo toast for cross-list moves; same-list reorders stay quiet. */
  const move = (id: string, target: DropTarget) => {
    const it = byId(id);
    if (!it) return;
    const from = { listId: it.listId, position: it.position };
    const crossList = target.listId !== it.listId;
    moveItem.mutate(
      { id, listId: target.listId, position: target.position },
      {
        onSuccess: (result) => {
          if (!crossList) return;
          const status = result.changed.status ? ` — Status set to ${statusName(result.changed.status.to)}` : "";
          const base = `Moved ${quote(it.title)} to ${listName(target.listId)}`;
          notify({ message: base + status, history: base, icon: "arrow-right", restore: () => moveItem.mutate({ id, listId: from.listId, position: from.position }) });
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
      if (target) move(id, { listId: target, position: it.position });
    } else move(id, { listId: it.listId, position: Math.max(0, it.position + (dir === "up" ? -1 : 1)) });
  };

  const removeMany = async (ids: string[], noun = "item") => {
    const selected = [...new Set(ids)].map(byId).filter((it): it is Item => !!it);
    const undoScope = useFeedback.getState().scope;
    const removed: Item[] = [];
    // Serial deletion keeps one failed request from rolling back another deletion's cache patch.
    for (const it of selected) {
      try {
        await deleteItem.mutateAsync({ id: it.id });
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
          await restoreItem.mutateAsync({ id: pending[0]! });
          pending.shift();
        }
      },
    });
  };
  const remove = (id: string) => removeMany([id]);

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

  /** Calendar drop: a new due date, with an undo toast. */
  const reschedule = (id: string, iso: string) => {
    const it = byId(id);
    if (!it || it.dueDate === iso) return;
    const prev = it.dueDate;
    updateItem.mutate({ id, dueDate: iso });
    notify({ message: `Moved ${quote(it.title)} to ${formatDate(iso, { year: "auto" })}`, icon: "calendar", restore: () => updateItem.mutate({ id, dueDate: prev }) });
  };

  /** Calendar "+": a fresh item due that day in the first list, undoable (the overlay then names it). */
  const addItemOn = (iso: string) => {
    const list = lists[0];
    if (!list) return;
    const id = newId();
    createItem.mutate({ id, title: "New item", listId: list.id, dueDate: iso });
    notify({ message: `Added an item due ${formatDate(iso, { year: "auto" })} to ${list.name}`, icon: "plus", restore: () => deleteItem.mutate({ id }) });
  };

  /** Move or copy items to a list in another project: one undo toast; a copy gets new keys. */
  const transfer = async (ids: string[], project: { id: string; name: string }, list: { id: string; name: string }, copy: boolean) => {
    const picked = new Set(ids);
    const sel = ids.map(byId).filter((x): x is Item => !!x);
    if (!sel.length) return;
    const noun = sel.length === 1 ? quote(sel[0]!.title) : count(sel.length, "item");
    const dest = `${project.name} › ${list.name}`;
    if (copy) {
      const made = sel.map((it) => ({ src: it, id: newId() }));
      made.forEach(({ src, id }) => createItem.mutate({ id, title: src.title, listId: list.id, status: src.status, priority: src.priority, startDate: src.startDate, dueDate: src.dueDate, description: src.description ?? undefined, labelIds: [], assigneeIds: src.assigneeIds }));
      notify({ message: `Copied ${noun} to ${dest}`, icon: "folder-output", restore: () => made.forEach(({ id }) => deleteItem.mutate({ id })) });
      return;
    }
    // Subitems travel with a selected parent; one at a time, so relations between moved items survive.
    const roots = sel.filter((it) => !it.parentItemId || !picked.has(it.parentItemId));
    const undoScope = useFeedback.getState().scope;
    const moved: Array<{ it: Item; result: MoveResult }> = [];
    const carried = emptyRestore();
    for (const it of roots) {
      try {
        const result = await moveItem.mutateAsync({ id: it.id, listId: list.id, toProjectId: project.id, restore: carried.relations.length ? { ...emptyRestore(), relations: carried.relations } : undefined });
        moved.push({ it, result });
        mergeRestore(carried, result.undo);
      } catch { /* The mutation reports the request error; only completed moves become undoable. */ }
    }
    if (!moved.length || useFeedback.getState().scope !== undoScope) return;
    // What the destination changed, in the message (it wraps); the history keeps the short form.
    const keyed = moved.filter((m) => m.result.changed.key);
    const sum = (k: "subitems" | "labelsRemoved" | "assigneesRemoved" | "watchersRemoved" | "relationsRemoved") => moved.reduce((n, m) => n + m.result.changed[k], 0);
    const created = [...new Set(moved.flatMap((m) => m.result.changed.labelsCreated))];
    const details = [
      keyed.length === 1 && moved.length === 1 ? `now ${keyed[0]!.result.changed.key}` : keyed.length ? count(keyed.length, "new key") : null,
      created.length === 1 ? `label ${quote(created[0]!)} added` : created.length ? `${count(created.length, "label")} added` : null,
      sum("labelsRemoved") ? `${count(sum("labelsRemoved"), "label")} removed` : null,
      sum("assigneesRemoved") ? `${count(sum("assigneesRemoved"), "non-member")} unassigned` : null,
      sum("watchersRemoved") ? `${count(sum("watchersRemoved"), "watcher")} without access removed` : null,
      sum("relationsRemoved") ? `${count(sum("relationsRemoved"), "relation")} to items left behind removed` : null,
    ].filter(Boolean).join(", ");
    const subitems = sum("subitems");
    const what = moved.length === 1 ? quote(moved[0]!.it.title) : count(moved.length, "item");
    const base = `Moved ${what} to ${dest}`;
    // Back in original order, each handing back what the move took; relations rejoin once both ends are home.
    // A top-level item returns to its index among its list's items (stored positions can have gaps).
    const rankOf = (it: Item) => (it.parentItemId ? it.position : items.filter((x) => x.listId === it.listId && !x.parentItemId).sort((a, b) => a.position - b.position).findIndex((x) => x.id === it.id));
    const back = moved.map((m) => ({ ...m, at: rankOf(m.it) })).sort((a, b) => a.at - b.at);
    notify({
      message: `Moved ${what}${subitems ? ` and ${count(subitems, "subitem")}` : ""} to ${dest}${details ? ` — ${details}` : ""}`,
      history: base,
      meta: moved.length < roots.length ? `${roots.length - moved.length} not moved` : undefined,
      icon: "folder-input",
      restore: async () => {
        while (back.length) {
          const { it, at, result: forward } = back[0]!;
          const result = await moveItem.mutateAsync({ id: it.id, listId: it.listId, position: at, toProjectId: projectId, restore: { ...carried, parentItemId: forward.undo?.parentItemId ?? null } });
          mergeRestore(carried, { ...emptyRestore(), relations: result.undo?.relations ?? [] });
          back.shift();
        }
      },
    });
  };

  const addList = (name?: string, statusRole?: ItemStatus | null) => createList.mutate({ id: newId(), name: name ?? `List ${project.lists.length + 1}`, statusRole: statusRole ?? undefined });

  /** Hiding is project-wide (shared project data), so the toast says so and Undo shows it again. */
  const hideList = (listId: string) =>
    updateList.mutate(
      { id: listId, hidden: true },
      { onSuccess: () => notify({ message: `Hid ${quote(listName(listId))} for everyone in this project`, history: `Hid ${quote(listName(listId))}`, icon: "eye-off", restore: () => updateList.mutateAsync({ id: listId, hidden: false }).then(() => undefined) }) },
    );
  const showLists = (ids: string[]) => ids.forEach((id) => updateList.mutate({ id, hidden: false }));
  /** Set a list's Status role; `applyToExisting` also sets it on the list's live items in the same request. */
  const setListRole = (listId: string, statusRole: ItemStatus | null, applyToExisting = false) =>
    updateList.mutate(
      { id: listId, statusRole, ...(applyToExisting ? { applyToExisting } : {}) },
      { onSuccess: (r) => { if (applyToExisting) notify({ message: `Set ${count(r.rewritten, "item")} in ${quote(listName(listId))} to ${statusName(statusRole)}`, icon: "milestone" }); } },
    );

  /** The BulkBar's actions for the current selection. */
  const bulkActions = (selectedIds: string[]): BulkAction[] => {
    const sel = selectedIds.map(byId).filter((x): x is Item => !!x);
    return [
      { id: "move", label: "Move to", icon: "arrow-right", options: [...lists.map((l) => ({ value: l.id, label: l.name, icon: listIconFor(l.name).icon, iconColor: listIconFor(l.name).color })), { value: null, label: "", divider: true }, { value: "__move", label: "Move to another project…", icon: "folder-input" }, { value: "__copy", label: "Copy to another project…", icon: "folder-output" }] },
      { id: "priority", label: "Priority", icon: "flag", options: [...PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p], icon: "flag" as const, iconColor: PRIO_COLORS[p] })), { value: null, label: "None", icon: "flag-off" }] },
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
    const noun = count(sel.length, "item");
    const snapshot = sel.map((it) => ({ ...it }));
    if (action === "move" && value) {
      const end = items.filter((it) => it.listId === value && !it.parentItemId).length;
      sel.forEach((it, i) => moveItem.mutate({ id: it.id, listId: value, position: end + i }));
      const dest = project.lists.find((l) => l.id === value);
      const status = dest?.statusRole && project.linkStatuses ? ` — Statuses set to ${statusName(dest.statusRole)}` : "";
      const base = `Moved ${noun} to ${listName(value)}`;
      notify({ message: base + status, history: base, icon: "arrow-right", restore: () => [...snapshot].reverse().forEach((it) => moveItem.mutate({ id: it.id, listId: it.listId, position: it.position })) });
      return true;
    }
    if (action === "priority") {
      const p = (value as ItemPriority | null) ?? null;
      sel.forEach((it) => updateItem.mutate({ id: it.id, priority: p }));
      notify({ message: p ? `Set priority ${PRIORITY_LABEL[p]} on ${noun}` : `Cleared priority on ${noun}`, icon: "flag", restore: () => snapshot.forEach((it) => updateItem.mutate({ id: it.id, priority: it.priority })) });
    } else if (action === "label" && value) {
      const label = labels.find((l) => l.id === value);
      if (!label) return false;
      const allHave = sel.every((it) => it.labelIds.includes(value));
      sel.forEach((it) => setLabels.mutate({ id: it.id, labelIds: allHave ? it.labelIds.filter((x) => x !== value) : [...it.labelIds.filter((x) => x !== value), value] }));
      notify({ message: `${allHave ? "Removed" : "Added"} the label ${label.name} ${allHave ? "from" : "to"} ${noun}`, icon: "tag", restore: () => snapshot.forEach((it) => setLabels.mutate({ id: it.id, labelIds: it.labelIds })) });
    } else if (action === "assign") {
      sel.forEach((it) => setAssignees.mutate({ id: it.id, userIds: value ? [value] : [] }));
      const who = people.find((p) => p.id === value);
      notify({ message: who ? `Assigned ${noun} to ${who.name.split(" ")[0]}` : `Unassigned ${noun}`, icon: "user-plus", restore: () => snapshot.forEach((it) => setAssignees.mutate({ id: it.id, userIds: it.assigneeIds })) });
    } else if (action === "done") {
      void completion.setDoneMany(sel, !sel.every((it) => it.done));
    }
    return false;
  };

  return { lists, hiddenLists, hideList, showLists, setListRole, people, quickAdd, addItem, move, onMoveItemKey, onItemKey, remove, removeMany, setDone, addList, updateList, createList, bulkActions, bulk, reschedule, addItemOn, transfer };
}

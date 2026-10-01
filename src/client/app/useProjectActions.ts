// The actions every project view shares: quick-add, done, priority, move (keyboard and drag) with the
// undo toast, delete, and the bulk versions behind the BulkBar. Views only render; this hook talks to
// the data layer and the feedback store. Every undoable outcome raises exactly one toast.
import { useMemo } from "react";

import type { ItemPriority } from "../../shared/enums";
import type { ItemStatus } from "../../shared/item-status";
import type { Item, Label, ProjectDetail } from "../data/api";
import { newId, useCreateItem, useCreateList, useDeleteItem, useMoveItem, useSetItemAssignees, useSetItemLabels, useUpdateItem, useUpdateList } from "../data/mutations";
import { listIconFor } from "../design/board/listIcons";
import { formatDate } from "../design/core/dates";
import { completeRecurring } from "../design/core/repeat";
import type { DropTarget } from "../design/board/useItemDnd";
import type { BulkAction } from "../design/core/BulkBar";
import type { QuickAddResult } from "../design/core/quickAdd";
import type { ItemAction } from "../design/core/shortcuts";
import { STATUSES } from "../design/core/statuses";
import { count } from "../design/core/text";
import { quote, useFeedback } from "./feedback";
import { PRIORITY_LABEL, type Person } from "./items";
import { peopleOf } from "./session";

const PRIORITIES: ItemPriority[] = ["URGENT", "HIGH", "MEDIUM", "LOW"];
const PRIO_COLORS: Record<ItemPriority, string> = { URGENT: "var(--label-red)", HIGH: "var(--label-orange)", MEDIUM: "var(--label-yellow)", LOW: "var(--label-blue)" };
const statusName = (id: string | null | undefined) => STATUSES.find((s) => s.id === id)?.name ?? "None";

export type ProjectActions = ReturnType<typeof useProjectActions>;

export function useProjectActions(projectId: string, project: ProjectDetail, items: Item[], labels: Label[]) {
  const scope = useMemo(() => ({ projectId }), [projectId]);
  const createItem = useCreateItem(scope);
  const updateItem = useUpdateItem(scope);
  const moveItem = useMoveItem(scope);
  const deleteItem = useDeleteItem(scope);
  const setLabels = useSetItemLabels(scope);
  const setAssignees = useSetItemAssignees(scope);
  const createList = useCreateList(projectId);
  const updateList = useUpdateList(projectId);
  const notify = useFeedback((s) => s.notify);
  const lists = project.lists.filter((l) => !l.hidden);
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

  const recreate = (it: Item) => createItem.mutate({ id: it.id, title: it.title, listId: it.listId, status: it.status, priority: it.priority, startDate: it.startDate, dueDate: it.dueDate, description: it.description ?? undefined, labelIds: it.labelIds, assigneeIds: it.assigneeIds });

  const remove = (id: string) => {
    const it = byId(id);
    if (!it) return;
    deleteItem.mutate({ id });
    notify({ message: `Deleted ${quote(it.title)}`, icon: "trash-2", restore: () => recreate(it) });
  };

  /** Done toggle. A recurring item checked done reopens on its next due instead (one toast, undoable). */
  const setDone = (id: string, done: boolean) => {
    const it = byId(id);
    if (!it) return;
    if (done && it.repeatRule && it.dueDate) {
      const r = completeRecurring(it.repeatRule, it.dueDate, { title: it.title, count: it.repeatCount });
      const prev = { dueDate: it.dueDate, repeatCount: it.repeatCount };
      if (r.ended) updateItem.mutate({ id, done: true, repeatCount: r.count });
      else updateItem.mutate({ id, dueDate: r.next, repeatCount: r.count });
      notify({ message: r.message, meta: r.meta, icon: r.icon, restore: () => updateItem.mutate({ id, done: false, ...prev }) });
      return;
    }
    updateItem.mutate({ id, done });
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
  const transfer = (ids: string[], project: { id: string; name: string }, list: { id: string; name: string }, copy: boolean) => {
    const sel = ids.map(byId).filter((x): x is Item => !!x);
    if (!sel.length) return;
    const noun = sel.length === 1 ? quote(sel[0]!.title) : count(sel.length, "item");
    const dest = `${project.name} › ${list.name}`;
    if (copy) {
      const made = sel.map((it) => ({ src: it, id: newId() }));
      made.forEach(({ src, id }) => createItem.mutate({ id, title: src.title, listId: list.id, status: src.status, priority: src.priority, startDate: src.startDate, dueDate: src.dueDate, description: src.description ?? undefined, labelIds: [], assigneeIds: src.assigneeIds }));
      notify({ message: `Copied ${noun} to ${dest}`, icon: "folder-output", restore: () => made.forEach(({ id }) => deleteItem.mutate({ id })) });
    } else {
      const snapshot = sel.map((it) => ({ id: it.id, listId: it.listId, position: it.position }));
      sel.forEach((it) => moveItem.mutate({ id: it.id, listId: list.id }));
      notify({ message: `Moved ${noun} to ${dest}`, icon: "folder-input", restore: () => snapshot.forEach((it) => moveItem.mutate({ id: it.id, listId: it.listId, position: it.position })) });
    }
  };

  const addList = (name?: string, statusRole?: ItemStatus | null) => createList.mutate({ id: newId(), name: name ?? `List ${project.lists.length + 1}`, statusRole: statusRole ?? undefined });

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
      const allDone = sel.every((it) => it.done);
      sel.forEach((it) => updateItem.mutate({ id: it.id, done: !allDone }));
      notify({ message: `Marked ${noun} ${allDone ? "not done" : "done"}`, icon: "circle-check", restore: () => snapshot.forEach((it) => updateItem.mutate({ id: it.id, done: it.done })) });
    } else if (action === "delete") {
      sel.forEach((it) => deleteItem.mutate({ id: it.id }));
      notify({ message: `Deleted ${noun}`, icon: "trash-2", restore: () => snapshot.forEach(recreate) });
      return true;
    }
    return false;
  };

  return { lists, people, quickAdd, addItem, move, onMoveItemKey, onItemKey, remove, setDone, addList, updateList, createList, bulkActions, bulk, reschedule, addItemOn, transfer };
}

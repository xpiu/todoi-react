// The actions every project view shares: quick-add, done, priority, move (keyboard and drag) with the
// undo toast, delete. Views only render; this hook talks to the data layer and the feedback store.
import { useMemo } from "react";

import type { ItemPriority } from "../../shared/enums";
import type { ItemStatus } from "../../shared/item-status";
import type { Item, Label, ProjectDetail } from "../data/api";
import { newId, useCreateItem, useCreateList, useDeleteItem, useMoveItem, useUpdateItem, useUpdateList } from "../data/mutations";
import type { DropTarget } from "../design/board/useItemDnd";
import type { ItemAction } from "../design/core/shortcuts";
import type { QuickAddResult } from "../design/core/quickAdd";
import { quote, useFeedback } from "./feedback";
import { type Person } from "./items";
import { SEED_PEOPLE } from "./session";

const PRIORITIES: ItemPriority[] = ["URGENT", "HIGH", "MEDIUM", "LOW"];
// Members with names: the seed's two people until the members endpoint carries user details.
const people: Person[] = SEED_PEOPLE;
const STATUS_NAMES: Record<string, string> = { NEW: "New", BACKLOG: "Backlog", TODO: "To-do", DOING: "Doing", DONE: "Done" };

export type ProjectActions = ReturnType<typeof useProjectActions>;

export function useProjectActions(projectId: string, project: ProjectDetail, items: Item[], labels: Label[]) {
  const scope = useMemo(() => ({ projectId }), [projectId]);
  const createItem = useCreateItem(scope);
  const updateItem = useUpdateItem(scope);
  const moveItem = useMoveItem(scope);
  const deleteItem = useDeleteItem(scope);
  const createList = useCreateList(projectId);
  const updateList = useUpdateList(projectId);
  const notify = useFeedback((s) => s.notify);
  const lists = project.lists.filter((l) => !l.hidden);
  const listName = (id: string) => project.lists.find((l) => l.id === id)?.name ?? "the list";

  const quickAdd = useMemo(
    () => ({ labels: labels.map((l) => ({ text: l.name, color: l.color })), members: people.map((p) => ({ name: p.name, nickname: p.nickname ?? undefined })), lists: project.lists.map((l) => ({ name: l.name, value: l.id })) }),
    [labels, project.lists],
  );

  const addItem = (listId: string, title: string, parsed: QuickAddResult, position: "top" | "bottom" = "bottom") => {
    const destination = parsed.list ? (project.lists.find((l) => l.name === parsed.list)?.id ?? listId) : listId;
    const labelIds = parsed.labels.map((pl) => labels.find((l) => l.name.toLowerCase() === pl.text.toLowerCase())?.id).filter((id): id is string => !!id);
    const assigneeIds = parsed.assignee ? people.filter((p) => p.name === parsed.assignee).map((p) => p.id) : [];
    createItem.mutate({ id: newId(), title, listId: destination, priority: parsed.priority ? (parsed.priority.toUpperCase() as ItemPriority) : undefined, dueDate: parsed.due ?? undefined, labelIds, assigneeIds, position });
  };

  /** Move with the undo toast for cross-list moves; same-list reorders stay quiet. */
  const move = (id: string, target: DropTarget) => {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    const from = { listId: it.listId, position: it.position };
    const crossList = target.listId !== it.listId;
    moveItem.mutate(
      { id, listId: target.listId, position: target.position },
      {
        onSuccess: (result) => {
          if (!crossList) return;
          const status = result.changed.status ? ` — Status set to ${STATUS_NAMES[result.changed.status.to ?? ""] ?? "None"}` : "";
          notify({ message: `Moved ${quote(it.title)} to ${listName(target.listId)}${status}`, history: `Moved ${quote(it.title)} to ${listName(target.listId)}`, icon: "arrow-right", restore: () => moveItem.mutate({ id, listId: from.listId, position: from.position }) });
        },
      },
    );
  };

  const onMoveItemKey = (id: string, dir: "up" | "down" | "left" | "right") => {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    const order = lists.map((l) => l.id);
    const li = order.indexOf(it.listId);
    if (dir === "left" || dir === "right") {
      const target = order[li + (dir === "left" ? -1 : 1)];
      if (target) move(id, { listId: target, position: it.position });
    } else move(id, { listId: it.listId, position: Math.max(0, it.position + (dir === "up" ? -1 : 1)) });
  };

  const remove = (id: string) => {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    deleteItem.mutate({ id });
    notify({ message: `Deleted ${quote(it.title)}`, icon: "trash-2", restore: () => createItem.mutate({ id: it.id, title: it.title, listId: it.listId, status: it.status, priority: it.priority, dueDate: it.dueDate, labelIds: it.labelIds, assigneeIds: it.assigneeIds }) });
  };

  const onItemKey = (id: string, action: ItemAction) => {
    const it = items.find((x) => x.id === id);
    if (!it) return;
    if (action === "done") updateItem.mutate({ id, done: !it.done });
    else if (action === "delete") remove(id);
    else if (action.startsWith("priority-")) {
      const n = Number(action.slice(9));
      updateItem.mutate({ id, priority: n === 0 ? null : PRIORITIES[n - 1]! });
    }
  };

  const addList = (name?: string, statusRole?: ItemStatus | null) => createList.mutate({ id: newId(), name: name ?? `List ${project.lists.length + 1}`, statusRole: statusRole ?? undefined });

  return { lists, people, quickAdd, addItem, move, onMoveItemKey, onItemKey, remove, setDone: (id: string, done: boolean) => updateItem.mutate({ id, done }), addList, updateList, createList };
}

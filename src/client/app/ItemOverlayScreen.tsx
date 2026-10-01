// ItemOverlayScreen — the item overlay on real data: the item from the project's items, its details
// (comments, relations, watching), the project's activity filtered to it, and every edit as a mutation.
// Undoable outcomes (archive, delete, duplicate) raise the one Toast. Spec: DESIGN.md › Item overlay.
import { useMemo, useState } from "react";

import type { Item, Label, ProjectDetail } from "../data/api";
import { useAddComment, useAddRelation, useDeleteComment, useEditComment, useLabelMutations, useReactComment, useRemoveRelation, useSetWatching } from "../data/itemContent";
import { newId, useCreateItem, useDeleteItem, useMoveItem, useSetItemAssignees, useSetItemLabels, useUpdateItem } from "../data/mutations";
import { useActivity, useItemDetails } from "../data/queries";
import type { PickableItem } from "../design/core/ItemPicker";
import { formatRelative, toISO } from "../design/core/dates";
import type { IconName } from "../design/core/Icon";
import { ItemOverlay, type OverlayItem } from "../design/overlay/ItemOverlay";
import { quote, useFeedback } from "./feedback";
import { coverOf, dueStateOf, keyOf, type Person } from "./items";
import { CURRENT_USER, SEED_PEOPLE } from "./session";

export interface ItemOverlayScreenProps {
  projectId: string;
  project: ProjectDetail;
  items: Item[];
  labels: Label[];
  itemId: string;
  editTitle?: boolean;
  onClose: () => void;
  onOpen: (id: string, edit?: boolean) => void;
  onSuggestShortcut?: (id: string, delay?: number) => void;
}

const people: Person[] = SEED_PEOPLE;
const personOf = (id: string) => people.find((p) => p.id === id);
const memberOf = (p: Person) => ({ id: p.id, name: p.name, nickname: p.nickname ?? undefined, color: p.avatarColor ? `var(--label-${p.avatarColor})` : undefined });

export function ItemOverlayScreen({ projectId, project, items, labels, itemId, editTitle, onClose, onOpen, onSuggestShortcut }: ItemOverlayScreenProps) {
  const item = items.find((it) => it.id === itemId);
  const details = useItemDetails(itemId);
  const activity = useActivity(projectId);
  const scope = useMemo(() => ({ projectId }), [projectId]);
  const updateItem = useUpdateItem(scope);
  const moveItem = useMoveItem(scope);
  const createItem = useCreateItem(scope);
  const deleteItem = useDeleteItem(scope);
  const setLabels = useSetItemLabels(scope);
  const setAssignees = useSetItemAssignees(scope);
  const addComment = useAddComment(itemId);
  const editComment = useEditComment(itemId);
  const deleteComment = useDeleteComment(itemId);
  const reactComment = useReactComment(itemId);
  const setWatching = useSetWatching(itemId);
  const addRelation = useAddRelation(itemId);
  const removeRelation = useRemoveRelation(itemId);
  const labelOps = useLabelMutations(projectId);
  const notify = useFeedback((s) => s.notify);
  const [now] = useState(() => new Date());
  if (!item) return null;

  const listName = (id: string) => project.lists.find((l) => l.id === id)?.name;
  const subitems = items.filter((it) => it.parentItemId === item.id).sort((a, b) => a.position - b.position);
  const projectItems: PickableItem[] = items.filter((it) => !it.parentItemId).map((it) => ({ id: it.id, title: it.title, itemId: keyOf(it, project.keyPrefix), listName: listName(it.listId), status: it.status, done: it.done }));
  const overlayItem: OverlayItem = {
    id: item.id,
    itemId: keyOf(item, project.keyPrefix),
    title: item.title,
    description: item.description,
    listId: item.listId,
    status: item.status,
    done: item.done,
    priority: item.priority,
    start: item.startDate,
    due: item.dueDate,
    dueTime: item.dueTime,
    dueState: dueStateOf(item),
    repeat: item.repeatRule,
    labelIds: item.labelIds,
    assigneeIds: item.assigneeIds,
    cover: coverOf(item),
    watching: details.data?.watching ?? false,
    subitems: subitems.map((s) => ({ id: s.id, text: s.title, done: s.done, itemId: keyOf(s, project.keyPrefix) })),
  };
  const comments = (details.data?.comments ?? []).map((c) => {
    const author = personOf(c.authorId);
    const by = (emoji: string) => c.reactions.filter((r) => r.emoji === emoji).map((r) => personOf(r.userId)?.name ?? "Someone");
    const emojis = [...new Set(c.reactions.map((r) => r.emoji))];
    return { id: c.id, author: author?.name ?? "Someone", authorId: c.authorId, color: author?.avatarColor ? `var(--label-${author.avatarColor})` : undefined, meta: formatRelative(c.createdAt, now), text: c.body, edited: !!c.editedAt, reactions: emojis.map((e) => ({ emoji: e, count: by(e).length, mine: c.reactions.some((r) => r.emoji === e && r.userId === CURRENT_USER.id), by: by(e) })) };
  });
  const activityRows = (activity.data ?? []).filter((a) => a.itemId === item.id).map((a) => ({ id: a.id, author: a.actor?.name ?? "Todoi", meta: formatRelative(a.createdAt, now), text: a.text }));
  const relations = (details.data?.relations ?? []).filter((r) => r.item).map((r) => ({ type: r.type, item: { id: r.item!.id, title: r.item!.title, itemId: keyOf(r.item!, project.keyPrefix), listName: listName(r.item!.listId), status: r.item!.status, done: r.item!.done } }));
  const patch = (changes: Parameters<typeof updateItem.mutate>[0] extends infer V ? Omit<V, "id"> : never) => updateItem.mutate({ id: item.id, ...changes });
  const openKey = (key: string) => {
    const target = items.find((it) => keyOf(it, project.keyPrefix) === key);
    if (target) onOpen(target.id);
  };

  return (
    <ItemOverlay
      open
      item={overlayItem}
      lists={project.lists.filter((l) => !l.hidden).map((l) => ({ id: l.id, name: l.name, icon: l.icon as IconName | null, statusRole: l.statusRole }))}
      labels={labels}
      members={people.map(memberOf)}
      currentUserId={CURRENT_USER.id}
      comments={comments}
      activity={activityRows}
      relations={relations}
      projectItems={projectItems}
      autoEditTitle={editTitle}
      today={toISO(now)!}
      onClose={onClose}
      onRename={(title) => patch({ title })}
      onMoveToList={(listId) => moveItem.mutate({ id: item.id, listId })}
      onSetStatus={(status) => patch(status === "DONE" ? { done: true } : item.done ? { done: false, status } : { status })}
      onSetPriority={(priority) => patch({ priority })}
      onSetDates={(v) => patch({ startDate: v.start, dueDate: v.due, dueTime: v.time })}
      onSetRepeat={(rule) => patch({ repeatRule: rule })}
      onSetLabels={(labelIds) => setLabels.mutate({ id: item.id, labelIds })}
      onCreateLabel={async (d) => {
        const made = await labelOps.create.mutateAsync({ name: d.name, color: d.color });
        return made;
      }}
      onEditLabel={(l, d) => labelOps.update.mutate({ id: l.id, name: d.name, color: d.color })}
      onDeleteLabel={(l) => labelOps.remove.mutate({ id: l.id })}
      onSetAssignees={(userIds) => setAssignees.mutate({ id: item.id, userIds })}
      onSetCover={(cover) => patch({ cover: cover ? (cover.src ? { attachmentId: cover.attachmentId } : { color: cover.color?.replace(/^var\(--label-([a-z]+)\)$/, "$1") }) : null })}
      onToggleWatch={(watching) => setWatching.mutate({ watching })}
      onSetDescription={(description) => patch({ description })}
      onAddSubitem={(title) => createItem.mutate({ id: newId(), title, listId: item.listId, parentItemId: item.id })}
      onToggleSubitem={(id, done) => updateItem.mutate({ id, done })}
      onReorderSubitem={(id, index) => {
        const order = subitems.filter((s) => s.id !== id);
        order.splice(index, 0, subitems.find((s) => s.id === id)!);
        order.forEach((s, i) => s.position !== i && updateItem.mutate({ id: s.id, position: i }));
      }}
      onOpenSubitem={(id) => onOpen(id)}
      onConvertSubitem={(id) => {
        const s = subitems.find((x) => x.id === id);
        updateItem.mutate({ id, parentItemId: null, position: items.filter((it) => it.listId === item.listId && !it.parentItemId).length });
        if (s) notify({ message: `${quote(s.title)} is now an item in ${listName(item.listId) ?? "the list"}`, icon: "arrow-up-from-line", restore: () => updateItem.mutate({ id, parentItemId: item.id }) });
      }}
      onMoveSubitem={(id, target) => {
        const s = subitems.find((x) => x.id === id);
        updateItem.mutate({ id, parentItemId: target.id });
        if (s) notify({ message: `Moved ${quote(s.title)} under ${target.itemId ?? target.title}`, icon: "corner-down-right", restore: () => updateItem.mutate({ id, parentItemId: item.id }) });
      }}
      onDeleteSubitem={(id) => {
        const s = subitems.find((x) => x.id === id);
        deleteItem.mutate({ id });
        if (s) notify({ message: `Deleted ${quote(s.title)}`, icon: "trash-2", restore: () => createItem.mutate({ id: s.id, title: s.title, listId: s.listId, parentItemId: item.id }) });
      }}
      onDeleteSubitems={() => {
        const snapshot = subitems.map((s) => ({ ...s }));
        snapshot.forEach((s) => deleteItem.mutate({ id: s.id }));
        notify({ message: `Deleted ${snapshot.length} subitem${snapshot.length === 1 ? "" : "s"}`, icon: "trash-2", restore: () => snapshot.forEach((s) => createItem.mutate({ id: s.id, title: s.title, listId: s.listId, parentItemId: item.id })) });
      }}
      onAddRelation={(type, target) => addRelation.mutate({ type, targetId: target.id })}
      onRemoveRelation={(type, targetId) => removeRelation.mutate({ type, targetId })}
      onOpenItem={(id) => onOpen(id)}
      onOpenKey={openKey}
      onAddComment={(body, replyToId) => addComment.mutate({ body, replyToId })}
      onEditComment={(id, body) => editComment.mutate({ id, body })}
      onDeleteComment={(id) => deleteComment.mutate({ id })}
      onReactComment={(id, emoji) => reactComment.mutate({ id, emoji })}
      onMakeSubitemOf={(parent) => {
        updateItem.mutate({ id: item.id, parentItemId: parent.id });
        notify({ message: `${quote(item.title)} is now a subitem of ${parent.itemId ?? parent.title}`, icon: "corner-down-right", restore: () => updateItem.mutate({ id: item.id, parentItemId: null }) });
        onClose();
      }}
      onMenuAction={(action) => {
        if (action === "duplicate") {
          const id = newId();
          createItem.mutate({ id, title: item.title, listId: item.listId, status: item.status, priority: item.priority, startDate: item.startDate, dueDate: item.dueDate, description: item.description ?? undefined, labelIds: item.labelIds, assigneeIds: item.assigneeIds });
          notify({ message: `Duplicated ${quote(item.title)}`, icon: "copy", restore: () => deleteItem.mutate({ id }) });
        } else if (action === "archive") {
          patch({ archived: true });
          notify({ message: `Archived ${quote(item.title)}`, icon: "archive", restore: () => updateItem.mutate({ id: item.id, archived: false }) });
          onClose();
        } else if (action === "delete") {
          const snapshot = { ...item };
          deleteItem.mutate({ id: item.id });
          notify({ message: `Deleted ${quote(item.title)}`, icon: "trash-2", restore: () => createItem.mutate({ id: snapshot.id, title: snapshot.title, listId: snapshot.listId, status: snapshot.status, priority: snapshot.priority, startDate: snapshot.startDate, dueDate: snapshot.dueDate, description: snapshot.description ?? undefined, labelIds: snapshot.labelIds, assigneeIds: snapshot.assigneeIds }) });
          onClose();
        } else if (action === "share") {
          void navigator.clipboard?.writeText(`${location.origin}${location.pathname}?item=${item.id}`);
          notify({ message: "Copied the item link", icon: "link" });
        }
      }}
      onSuggestShortcut={onSuggestShortcut}
    />
  );
}

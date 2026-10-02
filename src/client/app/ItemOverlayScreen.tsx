// ItemOverlayScreen — the item overlay on real data: the item from the project's items, its details
// (comments, relations, watching), the project's activity filtered to it, and every edit as a mutation.
// Undoable outcomes (archive, delete, duplicate) raise the one Toast. Spec: DESIGN.md › Item overlay.
import { useMemo, useRef, useState } from "react";

import { errorMessage, explain, type Item, type Label } from "../data/api";
import { useAddComment, useAddRelation, useDeleteComment, useEditComment, useLabelMutations, useReactComment, useRemoveRelation, useSetWatching } from "../data/itemContent";
import { newId, useCreateItem, useMoveItem, useSetItemAssignees, useSetItemLabels, useUpdateItem } from "../data/mutations";
import { useActivity, useItemDetails } from "../data/queries";
import { attachmentUrl, useAttachmentMutations } from "../data/attachments";
import { downloadText, fileSlug, itemToMarkdown, itemsToCsv } from "./exportData";
import { useProjectActions } from "./useProjectActions";
import { useProjectPicker } from "./useProjectPicker";
import type { PickableItem } from "../design/core/ItemPicker";
import { formatDate, formatRelative } from "../design/core/dates";
import type { IconName } from "../design/core/Icon";
import type { AttachmentFile } from "../design/overlay/Attachments";
import { ItemOverlay, type OverlayItem } from "../design/overlay/ItemOverlay";
import { useDrafts } from "./drafts";
import { MissingItem } from "./MissingItem";
import { attachFiles, dismissUpload, retryUploads, usePendingUploads } from "./uploads";
import { copyAndNotify, quote, useFeedback } from "./feedback";
import { coverOf, dueStateOf, keyOf, type Person } from "./items";
import { useToday } from "./today";
import { peopleOf, useCurrentUser, type ItemContainer } from "./session";

export interface ItemOverlayScreenProps {
  /** null: an Inbox item (`project` is then `inboxContainer`) */
  projectId: string | null;
  project: ItemContainer;
  items: Item[];
  labels: Label[];
  itemId: string;
  editTitle?: boolean;
  onClose: () => void;
  onOpen: (id: string, edit?: boolean) => void;
  onSuggestShortcut?: (id: string, delay?: number) => void;
}

const memberOf = (p: Person) => ({ id: p.id, name: p.name, nickname: p.nickname ?? undefined, color: p.avatarColor ? `var(--label-${p.avatarColor})` : undefined });

export function ItemOverlayScreen({ projectId, project, items, labels, itemId, editTitle, onClose, onOpen, onSuggestShortcut }: ItemOverlayScreenProps) {
  const item = items.find((it) => it.id === itemId);
  const details = useItemDetails(itemId);
  const activity = useActivity(projectId ?? "");
  const scope = useMemo(() => (projectId ? { projectId } : { listId: "inbox" }), [projectId]);
  const updateItem = useUpdateItem(scope);
  const moveItem = useMoveItem(scope);
  const createItem = useCreateItem(scope);
  const setLabels = useSetItemLabels(scope);
  const setAssignees = useSetItemAssignees(scope);
  const addComment = useAddComment(itemId);
  const editComment = useEditComment(itemId);
  const deleteComment = useDeleteComment(itemId);
  const reactComment = useReactComment(itemId);
  const setWatching = useSetWatching(itemId);
  const addRelation = useAddRelation(itemId);
  const removeRelation = useRemoveRelation(itemId);
  const labelOps = useLabelMutations(projectId ?? "");
  const files = useAttachmentMutations(itemId, projectId);
  const uploads = usePendingUploads(itemId);
  const actions = useProjectActions(projectId, project, items, labels);
  const picker = useProjectPicker(projectId ?? "");
  const notify = useFeedback((s) => s.notify);
  const [now] = useState(() => new Date());
  const today = useToday();
  const { user } = useCurrentUser();
  const people: Person[] = useMemo(() => peopleOf(project), [project]);
  const personOf = (id: string) => people.find((p) => p.id === id);
  // Drafts kept from an earlier visit (read once; the overlay reports every change back).
  const [drafts] = useState(() => useDrafts.getState().byItem[itemId]);
  const keepDrafts = useDrafts((s) => s.set);
  // One id per comment draft: resending after a failure cannot post it twice.
  const commentId = useRef(newId());
  if (!item) return <MissingItem itemId={itemId} projectId={projectId} onClose={onClose} />;

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
    dueState: dueStateOf(item, today),
    repeat: item.repeatRule,
    labelIds: item.labelIds,
    assigneeIds: item.assigneeIds,
    cover: coverOf(item),
    watching: details.data?.watching ?? false,
    subitems: subitems.map((s) => ({ id: s.id, text: s.title, done: s.done, itemId: keyOf(s, project.keyPrefix) })),
    attachments: (details.data?.attachments ?? []).map((a): AttachmentFile => ({ id: a.id, name: a.name, size: a.size, mime: a.mime, src: attachmentUrl(a.id), url: attachmentUrl(a.id, true), meta: `Added ${formatDate(a.createdAt, { year: "auto", today: now })}`, isCover: item.cover?.attachmentId === a.id })).concat(
      uploads.map((u) => ({ id: u.key, name: u.file.name, size: u.file.size, mime: u.file.type, progress: u.error ? undefined : u.progress, error: u.error, retriable: u.retriable })),
    ),
  };
  const exportCtx = { prefix: project.keyPrefix, labels, people, listName: (id: string) => listName(id) ?? "" };
  const comments = (details.data?.comments ?? []).map((c) => {
    const author = personOf(c.authorId);
    const by = (emoji: string) => c.reactions.filter((r) => r.emoji === emoji).map((r) => personOf(r.userId)?.name ?? "Someone");
    const emojis = [...new Set(c.reactions.map((r) => r.emoji))];
    return { id: c.id, author: author?.name ?? "Someone", authorId: c.authorId, color: author?.avatarColor ? `var(--label-${author.avatarColor})` : undefined, meta: formatRelative(c.createdAt, now), text: c.body, edited: !!c.editedAt, reactions: emojis.map((e) => ({ emoji: e, count: by(e).length, mine: c.reactions.some((r) => r.emoji === e && r.userId === user?.id), by: by(e) })) };
  });
  const activityRows = (activity.data ?? []).filter((a) => a.itemId === item.id).map((a) => ({ id: a.id, author: a.actor?.name ?? "Todoi", meta: formatRelative(a.createdAt, now), text: a.text }));
  const relations = (details.data?.relations ?? []).map((r) => ({ type: r.type, item: { id: r.item.id, title: r.item.title, itemId: keyOf(r.item, project.keyPrefix), listName: listName(r.item.listId), status: r.item.status, done: r.item.done } }));
  const patch = (changes: Parameters<typeof updateItem.mutate>[0] extends infer V ? Omit<V, "id"> : never) => updateItem.mutate({ id: item.id, ...changes });
  /** A save the overlay waits on: it keeps the draft and shows this reason when the request fails. */
  const saving = (request: Promise<unknown>) => request.catch(explain);
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
      currentUserId={user?.id ?? ""}
      comments={comments}
      activity={activityRows}
      relations={relations}
      detailsState={details.data ? undefined : details.isError ? { error: errorMessage(details.error), onRetry: () => void details.refetch() } : "loading"}
      projectItems={projectItems}
      autoEditTitle={editTitle}
      today={today}
      inbox={!projectId}
      onClose={onClose}
      onRename={(title) => saving(updateItem.mutateAsync({ id: item.id, title, quiet: true }))}
      onMoveToList={(listId) => moveItem.mutate({ id: item.id, listId })}
      onSetStatus={(status) => (status === "DONE" ? actions.setDone(item.id, true) : patch({ status }))}
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
      onToggleWatch={projectId && details.data ? (watching) => setWatching.mutate({ watching }) : undefined}
      onSetDescription={(description) => saving(updateItem.mutateAsync({ id: item.id, description, quiet: true }))}
      onAddSubitem={(title) => createItem.mutate({ id: newId(), title, listId: item.listId, parentItemId: item.id })}
      onToggleSubitem={(id, done) => actions.setDone(id, done)}
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
      onDeleteSubitem={(id) => void actions.remove(id)}
      onDeleteSubitems={() => void actions.removeMany(subitems.map((s) => s.id), "subitem")}
      onAddRelation={(type, target) => addRelation.mutate({ type, targetId: target.id })}
      onRemoveRelation={(type, targetId) => removeRelation.mutate({ type, targetId })}
      onOpenItem={(id) => onOpen(id)}
      onOpenKey={openKey}
      onAddComment={(body, replyToId) => saving(addComment.mutateAsync({ id: commentId.current, body, replyToId, quiet: true }).then(() => {
        commentId.current = newId();
      }))}
      onEditComment={(id, body) => saving(editComment.mutateAsync({ id, body, quiet: true }))}
      drafts={drafts}
      onDraftsChange={(d) => keepDrafts(item.id, d)}
      onDeleteComment={(id) => deleteComment.mutate({ id })}
      onReactComment={(id, emoji) => reactComment.mutate({ id, emoji })}
      onMakeSubitemOf={(parent) => {
        updateItem.mutate({ id: item.id, parentItemId: parent.id });
        notify({ message: `${quote(item.title)} is now a subitem of ${parent.itemId ?? parent.title}`, icon: "corner-down-right", restore: () => updateItem.mutate({ id: item.id, parentItemId: null }) });
        onClose();
      }}
      onMenuAction={(action) => {
        if (action === "duplicate") void actions.copyItems([item.id], { projectId, listId: item.listId, name: null });
        else if (action === "archive") {
          patch({ archived: true });
          notify({ message: `Archived ${quote(item.title)}`, icon: "archive", restore: () => updateItem.mutate({ id: item.id, archived: false }) });
          onClose();
        } else if (action === "delete") {
          void actions.remove(item.id);
          onClose();
        } else if (action === "share") {
          void copyAndNotify(`${location.origin}${location.pathname}?item=${item.id}`, "Copied the item link");
        }
      }}
      onAddFiles={(fs, opts) =>
        void attachFiles(item.id, projectId, fs).then((made) => {
          if (opts?.cover && made[0]) patch({ cover: { attachmentId: made[0].id } });
        })
      }
      onAttachmentAction={(id, action, arg) => {
        if (action === "retry") void retryUploads([id]);
        else if (action === "dismiss") dismissUpload(id);
        else if (action === "open") window.open(attachmentUrl(id), "_blank", "noopener");
        else if (action === "download") window.open(attachmentUrl(id, true), "_blank", "noopener");
        else if (action === "rename" && arg) files.rename.mutate({ id, name: arg });
        else if (action === "delete") {
          const f = details.data?.attachments.find((a) => a.id === id);
          files.remove.mutate({ id }, { onSuccess: () => notify({ message: `Deleted ${quote(f?.name ?? "the file")}`, icon: "trash-2" }) });
        }
      }}
      onExport={(format) => {
        const slug = fileSlug(`${keyOf(item, project.keyPrefix) ?? ""} ${item.title}`);
        if (format === "pdf") window.print();
        else if (format === "md") downloadText(`${slug}.md`, itemToMarkdown(item, exportCtx, { subitems, attachments: details.data?.attachments, comments: comments.map((c) => ({ author: c.author, body: c.text, date: c.meta })) }), "text/markdown");
        else downloadText(`${slug}.csv`, itemsToCsv([item, ...subitems], exportCtx), "text/csv");
        if (format !== "pdf") notify({ message: `Exported ${quote(item.title)} as ${format.toUpperCase()}`, icon: "download" });
      }}
      onPrint={() => window.print()}
      projects={picker.projects}
      loadLists={picker.loadLists}
      onMoveToProject={(proj, list) => {
        void actions.transfer([item.id], proj, list, false);
        onClose();
      }}
      onCopyToProject={(proj, list) => void actions.transfer([item.id], proj, list, true)}
      onSuggestShortcut={onSuggestShortcut}
    />
  );
}

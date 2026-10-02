// InboxScreen — the account-level list that catches items without a project and every notification.
// One ListSection with its own page title; "Mark all read" while anything is unread. Rows open the
// item overlay (`?item=`), file onto a project (overlay "Move to project…", or a drag onto the
// sidebar), reorder by drag, and take the list keyboard model. Spec: DESIGN.md › Notifications.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useRef } from "react";

import { api, unwrap, type Item } from "../data/api";
import { newId, useCreateItem, useUpdateItem } from "../data/mutations";
import { keys, searchQuery } from "../data/queries";
import { useItemDnd } from "../design/board/useItemDnd";
import { Button } from "../design/core/Button";
import { EmptyState } from "../design/core/EmptyState";
import type { ItemAction } from "../design/core/shortcuts";
import { ViewSkeleton } from "../design/core/Skeleton";
import { ListRow } from "../design/list/ListRow";
import { ListSection } from "../design/list/ListSection";
import { ListView } from "../design/list/ListView";
import { notifyFailure, useFeedback } from "./feedback";
import { INBOX_SCOPE, NO_LABELS, useInbox } from "./inbox";
import { ItemOverlayScreen } from "./ItemOverlayScreen";
import { rowsForList } from "./items";
import { useToday } from "./today";
import { LoadFailed } from "./LoadFailed";
import { usePrefs } from "./prefs";
import { hitKey, useOpenResult } from "./search";
import "./screens.css";

export function InboxScreen() {
  const { items, container, actions } = useInbox();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const search = useSearch({ from: "/app/inbox" });
  const createItem = useCreateItem(INBOX_SCOPE);
  const updateItem = useUpdateItem(INBOX_SCOPE);
  const openResult = useOpenResult();
  const notify = useFeedback((s) => s.notify);
  const showCompleted = usePrefs((s) => s.showCompleted);
  const today = useToday();
  // Inbox capture parses dates and priority only: labels, people and lists belong to a project.
  const inboxQuickAdd = useMemo(() => ({ dates: actions.quickAdd.dates }), [actions.quickAdd.dates]);
  const root = useRef<HTMLDivElement | null>(null);
  const dnd = useItemDnd(root, { listSelector: ".td-lsec", itemSelector: ".td-lrow[data-drag-id]", cardsSelector: ".td-lsec-body", onDrop: actions.move });
  const markAllRead = useMutation({
    mutationFn: () => api.api.inbox["mark-all-read"].$post().then((r) => unwrap<{ marked: number }>(r)),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.items(INBOX_SCOPE) });
      void qc.invalidateQueries({ queryKey: keys.inboxUnread });
    },
  });
  const markRead = (it: Item) => {
    if (it.unread) updateItem.mutate({ id: it.id, unread: false, quiet: true }, { onSettled: () => void qc.invalidateQueries({ queryKey: keys.inboxUnread }) });
  };
  const open = (id: string, edit?: boolean) => void navigate({ to: "/inbox", search: { item: id, ...(edit ? { edit: true } : {}) } });
  const close = () => void navigate({ to: "/inbox", search: {} });

  // Opening an item reads it — once per item, so a failed request doesn't retry in a loop.
  const opened = search.item ? items.data?.find((it) => it.id === search.item) : undefined;
  const readId = opened?.unread ? opened.id : null;
  const tried = useRef(new Set<string>());
  const { mutate: patchItem } = updateItem;
  useEffect(() => {
    if (!readId || tried.current.has(readId)) return;
    tried.current.add(readId);
    patchItem({ id: readId, unread: false, quiet: true }, { onSettled: () => void qc.invalidateQueries({ queryKey: keys.inboxUnread }) });
  }, [readId, patchItem, qc]);
  // "Create › Item" lands here with `capture`: open the quick-add field once the list is up.
  const loaded = !!items.data;
  useEffect(() => {
    if (!search.capture || !loaded) return;
    root.current?.querySelector<HTMLButtonElement>("[data-add-item]")?.click();
    void navigate({ to: "/inbox", search: (s) => ({ ...s, capture: undefined }), replace: true });
  }, [search.capture, loaded, navigate]);

  /** A notification's key opens the item it is about — wherever it lives, if the viewer can still open it. */
  const openAbout = async (it: Item) => {
    const n = it.notification;
    if (!n?.aboutKey) return;
    markRead(it);
    try {
      const hits = await qc.fetchQuery(searchQuery(n.aboutKey));
      const hit = hits.find((h) => h.id === n.aboutItemId) ?? hits.find((h) => hitKey(h)?.toUpperCase() === n.aboutKey!.toUpperCase());
      if (hit) openResult.item(hit);
      else notify({ message: `${n.aboutKey} isn't available to you anymore`, icon: "circle-alert" });
    } catch (err) {
      notifyFailure(err);
    }
  };

  if (items.isError) return <LoadFailed what="the Inbox" error={items.error} onRetry={() => void items.refetch()} />;
  if (!items.data) return <ViewSkeleton view="inbox" />;
  // Done items stay out of sight when Settings › Show completed items is off (subitems stay with their parent).
  const data = showCompleted ? items.data : items.data.filter((it) => !it.done || it.parentItemId);
  const byId = (id: string) => data.find((x) => x.id === id);
  const listId = data[0]?.listId;
  const rows = listId ? rowsForList(data, listId, { prefix: "", labels: [], people: [], withCreated: true, today }) : [];
  const unread = data.some((it) => it.unread);
  const onItemKey = (id: string, action: ItemAction) => {
    if (action === "edit") open(id, true);
    else actions.onItemKey(id, action);
  };
  return (
    <>
      <ListView ref={root} showAddList={false} onItemKey={onItemKey} onMoveItem={actions.onMoveItemKey} rootProps={dnd.rootProps}>
        <ListSection
          listId={listId}
          name="Inbox"
          icon="inbox"
          iconColor="var(--ink-600)"
          menu={false}
          collapsible={false}
          actions={
            unread ? (
              <Button variant="ghost" icon="check-check" onClick={() => markAllRead.mutate()}>
                Mark all read
              </Button>
            ) : null
          }
          quickAdd={inboxQuickAdd}
          onAddItem={(title, parsed, position) => createItem.mutate({ id: newId(), title, position, priority: actions.priorityOf(parsed), dueDate: parsed.due ?? undefined })}
        >
          {rows.length ? (
            rows.map((r) => {
              const it = byId(r.id);
              const about = it?.notification?.aboutKey;
              return (
                <ListRow
                  key={r.id}
                  dragId={r.id}
                  title={r.title}
                  done={r.done}
                  onDone={(done) => actions.setDone(r.id, done)}
                  due={r.due}
                  dueState={r.dueState}
                  priority={r.priority}
                  attachments={r.attachments}
                  created={r.created}
                  unread={r.unread}
                  about={about && it ? { key: about, onOpen: () => void openAbout(it) } : undefined}
                  onClick={() => open(r.id)}
                  subitems={r.subitems.map((s) => ({ title: s.title, done: s.done, dragId: `${r.id}/${s.id}`, onDone: (done: boolean) => actions.setDone(s.id, done) }))}
                />
              );
            })
          ) : (
            <EmptyState surface="card" compact icon="inbox" title="Your inbox is empty" hint="Capture anything here. When it has a home, open it and choose Move to project, or drag it onto a project in the sidebar." />
          )}
        </ListSection>
      </ListView>
      {opened ? <ItemOverlayScreen key={opened.id} projectId={null} project={container} items={items.data} labels={NO_LABELS} itemId={opened.id} editTitle={search.edit} onClose={close} onOpen={open} /> : null}
    </>
  );
}

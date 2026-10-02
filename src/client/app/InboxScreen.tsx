// InboxScreen — the account-level list that catches items without a project and every notification.
// One ListSection with its own page title; "Mark all read" while anything is unread. Spec: DESIGN.md › Notifications.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";

import { api, unwrap } from "../data/api";
import { newId, useCreateItem } from "../data/mutations";
import { keys, useListItems } from "../data/queries";
import { Button } from "../design/core/Button";
import { EmptyState } from "../design/core/EmptyState";
import { ViewSkeleton } from "../design/core/Skeleton";
import { ListRow } from "../design/list/ListRow";
import { ListSection } from "../design/list/ListSection";
import { ListView } from "../design/list/ListView";
import { useCompletion } from "./completion";
import { rowsForList } from "./items";
import { LoadFailed } from "./LoadFailed";
import "./screens.css";

export function InboxScreen() {
  const items = useListItems();
  const qc = useQueryClient();
  const scope = useMemo(() => ({ listId: "inbox" }), []);
  const createItem = useCreateItem(scope);
  const completion = useCompletion(scope);
  // A search result or link names an item: bring its row into view and focus it.
  const target = useSearch({ from: "/app/inbox" }).item;
  const loaded = !!items.data;
  useEffect(() => {
    if (!target || !loaded) return;
    const row = document.querySelector<HTMLElement>(`[data-drag-id="${CSS.escape(target)}"]`);
    row?.scrollIntoView({ block: "center" });
    row?.focus();
  }, [target, loaded]);
  const markAllRead = useMutation({
    mutationFn: () => api.api.inbox["mark-all-read"].$post().then((r) => unwrap<{ marked: number }>(r)),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.items(scope) });
      void qc.invalidateQueries({ queryKey: keys.inboxUnread });
    },
  });
  if (items.isError) return <LoadFailed what="the Inbox" error={items.error} onRetry={() => void items.refetch()} />;
  if (!items.data) return <ViewSkeleton view="inbox" />;
  const listId = items.data[0]?.listId;
  const rows = listId ? rowsForList(items.data, listId, { prefix: "", labels: [], people: [], withCreated: true }) : [];
  const unread = items.data.some((it) => it.unread);
  return (
    <ListView showAddList={false} onItemKey={(id, action) => {
      const it = items.data!.find((x) => x.id === id);
      if (action === "done" && it) void completion.setDone(it, !it.done);
    }}>
      <ListSection
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
        onAddItem={(title, parsed) => createItem.mutate({ id: newId(), title, priority: parsed.priority ? (parsed.priority.toUpperCase() as "URGENT" | "HIGH" | "MEDIUM" | "LOW") : undefined, dueDate: parsed.due ?? undefined })}
      >
        {rows.length ? (
          rows.map((r) => <ListRow key={r.id} dragId={r.id} title={r.title} done={r.done} onDone={(done) => {
            const it = items.data!.find((x) => x.id === r.id);
            if (it) void completion.setDone(it, done);
          }} due={r.due} dueState={r.dueState} priority={r.priority} created={r.created} unread={r.unread} />)
        ) : (
          <EmptyState surface="card" compact icon="inbox" title="Your inbox is empty" hint="Capture anything here; drag it onto a project in the sidebar when it has a home." />
        )}
      </ListSection>
    </ListView>
  );
}

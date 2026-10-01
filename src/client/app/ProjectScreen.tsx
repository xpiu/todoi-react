// ProjectScreen — one project in the view the URL names: List (default), Board, Calendar. The URL
// also carries the filters and sort; selection lives here so it survives a view switch.
// Spec: DESIGN.md › Views, Filtering, Selection.
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";

import type { ItemStatus } from "../../shared/item-status";
import { ApiError, type Item, type Label, type ProjectDetail } from "../data/api";
import { newId } from "../data/mutations";
import { useLabels, useProject, useProjectItems } from "../data/queries";
import { BoardView } from "../design/board/BoardView";
import { ItemCard } from "../design/board/ItemCard";
import { ListColumn } from "../design/board/ListColumn";
import { useItemDnd, type ItemDnd } from "../design/board/useItemDnd";
import { CalendarView } from "../design/calendar/CalendarView";
import type { CalendarItem } from "../design/calendar/calendar";
import { BulkBar } from "../design/core/BulkBar";
import { EmptyState } from "../design/core/EmptyState";
import type { IconName } from "../design/core/Icon";
import type { SelectMode } from "../design/core/KeyNav";
import type { ItemAction } from "../design/core/shortcuts";
import { ViewSkeleton } from "../design/core/Skeleton";
import { useTouchDrag } from "../design/core/touchDrag";
import { ListRow } from "../design/list/ListRow";
import { ListSection } from "../design/list/ListSection";
import { ListView } from "../design/list/ListView";
import { decodeViewState, encodeViewState } from "../design/navigation/viewState";
import { itemComparator, matchesFilters, sortLists } from "./filters";
import { coverOf, rowsForList } from "./items";
import { useAttachmentMutations } from "../data/attachments";
import { Dialog } from "../design/core/Dialog";
import { ProjectPicker } from "../design/core/ProjectPicker";
import { useFileDropTargets } from "../design/overlay/Attachments";
import { useFeedback } from "./feedback";
import { ItemOverlayScreen } from "./ItemOverlayScreen";
import { useProjectPicker } from "./useProjectPicker";
import { LoadFailed } from "./LoadFailed";
import { peopleOf } from "./session";
import { useProjectActions, type ProjectActions } from "./useProjectActions";
import "./screens.css";

const projectRoute = getRouteApi("/app/p/$projectId");

export function ProjectScreen() {
  const { projectId } = projectRoute.useParams();
  const search = projectRoute.useSearch();
  const state = decodeViewState(search);
  const navigate = useNavigate();
  const project = useProject(projectId);
  const items = useProjectItems(projectId);
  const labels = useLabels(projectId);
  const view = state.view ?? project.data?.defaultView ?? "list";
  // Selection is per project: a different project reads as an empty selection.
  const [sel, setSel] = useState<{ pid: string; ids: string[] }>({ pid: projectId, ids: [] });
  const selectedIds = sel.pid === projectId ? sel.ids : [];
  const setSelectedIds = (next: string[] | ((prev: string[]) => string[])) => setSel((cur) => ({ pid: projectId, ids: typeof next === "function" ? next(cur.pid === projectId ? cur.ids : []) : next }));

  const failed = project.isError ? project : items.isError ? items : labels.isError ? labels : null;
  if (failed && failed.error instanceof ApiError && failed.error.status === 401) {
    void navigate({ to: "/login", search: { next: location.pathname + location.search } });
    return null;
  }
  if (failed) return <LoadFailed what="this project" error={failed.error} onRetry={() => void failed.refetch()} />;
  if (!project.data || !items.data || !labels.data) return <ViewSkeleton view={view === "board" ? "board" : "list"} lists={project.data?.lists.length ?? 3} />;
  const go = (next: Partial<typeof state>) => void navigate({ to: "/p/$projectId", params: { projectId }, search: encodeViewState({ ...state, ...next }) });
  const props: ViewProps = {
    projectId,
    project: project.data,
    items: items.data,
    labels: labels.data,
    filters: state.filters,
    sort: state.sort,
    selectedIds,
    setSelectedIds,
    clearFilters: () => go({ filters: [], savedView: undefined }),
    openItem: (id, edit) => go({ item: id, edit: !!edit }),
  };
  const overlay = state.item ? <ItemOverlayScreen key={state.item} projectId={projectId} project={project.data} items={items.data} labels={labels.data} itemId={state.item} editTitle={state.edit} onClose={() => go({ item: undefined, edit: undefined })} onOpen={(id, edit) => go({ item: id, edit: !!edit })} /> : null;
  const body = view === "board" ? <ProjectBoard {...props} /> : view === "calendar" ? <ProjectCalendar {...props} /> : <ProjectList {...props} />;
  return (
    <>
      {body}
      {overlay}
    </>
  );
}

interface ViewProps {
  projectId: string;
  project: ProjectDetail;
  items: Item[];
  labels: Label[];
  filters: ReturnType<typeof decodeViewState>["filters"];
  sort: ReturnType<typeof decodeViewState>["sort"];
  selectedIds: string[];
  setSelectedIds: (next: string[] | ((prev: string[]) => string[])) => void;
  clearFilters: () => void;
  openItem: (id: string, edit?: boolean) => void;
}

interface VisibleList {
  id: string;
  name: string;
  icon: IconName | null;
  statusRole: ItemStatus | null;
  total: number;
  count: number;
  countLabel: number | string;
}

/** Everything a view needs beyond rendering: visible lists (filtered, sorted), actions, selection, drag. */
function useProjectView({ projectId, project, items, labels, filters, sort, selectedIds, setSelectedIds, openItem }: ViewProps, root: React.RefObject<HTMLDivElement | null>, dndOpts: { listSelector: string; itemSelector: string; cardsSelector: string }) {
  const actions = useProjectActions(projectId, project, items, labels);
  const dnd = useItemDnd(root, { ...dndOpts, onDrop: actions.move });
  useTouchItemDrag(root, dnd, dndOpts.itemSelector, actions.move);
  // Files dropped on a card or row attach to that item.
  const [dropTarget, setDropTarget] = useState<{ id: string; files: File[] } | null>(null);
  const fileDrop = useFileDropTargets((files, id) => setDropTarget({ id, files }), { selector: dndOpts.itemSelector });
  const rootProps = { ...dnd.rootProps, ...mergeDrag(dnd.rootProps, fileDrop) };
  const [transfer, setTransfer] = useState<"move" | "copy" | null>(null);
  const picker = useProjectPicker(projectId);
  const anchor = useRef<string | null>(null);

  const ctx = useMemo(() => ({ labels, people: peopleOf(project) }), [labels, project]);
  const visibleItems = useMemo(() => {
    if (!filters.length) return items;
    const keep = new Set(items.filter((it) => !it.parentItemId && matchesFilters(it, filters, ctx)).map((it) => it.id));
    return items.filter((it) => (it.parentItemId ? keep.has(it.parentItemId) : keep.has(it.id)));
  }, [items, filters, ctx]);
  const order = itemComparator(sort.items);
  const lists: VisibleList[] = sortLists(
    actions.lists.map((l) => {
      const total = items.filter((it) => it.listId === l.id && !it.parentItemId).length;
      const count = visibleItems.filter((it) => it.listId === l.id && !it.parentItemId).length;
      return { id: l.id, name: l.name, icon: (l.icon as IconName | null) ?? null, statusRole: l.statusRole, total, count, countLabel: filters.length ? `${count} of ${total}` : count };
    }),
    sort.lists,
  );
  const rowsOf = (listId: string) => rowsForList(visibleItems, listId, { prefix: project.keyPrefix, labels, people: actions.people, order });
  const allFiltered = filters.length > 0 && lists.length > 0 && lists.every((l) => !l.count) && lists.some((l) => l.total);
  const hiddenCount = lists.reduce((n, l) => n + (l.total - l.count), 0);

  // Selection: S / shift+arrows / Ctrl+A from KeyNav, Ctrl+click toggles, shift+click ranges within a list.
  const onItemSelect = (ids: string[], mode: SelectMode) => {
    if (mode === "toggle") setSelectedIds((prev) => (ids.every((id) => prev.includes(id)) ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])]));
    else if (mode === "extend") setSelectedIds((prev) => [...new Set([...prev, ...ids])]);
    else setSelectedIds(ids);
    anchor.current = ids[ids.length - 1] ?? null;
  };
  const onItemClick = (id: string, listId: string, e: SyntheticEvent) => {
    const me = e as unknown as { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean };
    if (me.ctrlKey || me.metaKey) {
      e.preventDefault();
      onItemSelect([id], "toggle");
    } else if (me.shiftKey && anchor.current) {
      e.preventDefault();
      const ids = rowsOf(listId).map((r) => r.id);
      const a = ids.indexOf(anchor.current), b = ids.indexOf(id);
      if (a >= 0 && b >= 0) setSelectedIds((prev) => [...new Set([...prev, ...ids.slice(Math.min(a, b), Math.max(a, b) + 1)])]);
      else onItemSelect([id], "toggle");
    }
    else openItem(id);
  };
  // Single-key actions apply to the whole selection when the focused item is part of it.
  const onItemKey = (id: string, action: ItemAction) => {
    if (action === "edit") {
      openItem(id, true);
      return;
    }
    if (selectedIds.length > 1 && selectedIds.includes(id)) {
      if (action === "done" || action === "delete") {
        if (actions.bulk(action, undefined, selectedIds)) setSelectedIds([]);
        return;
      }
      if (action.startsWith("priority-")) {
        const n = Number(action.slice(9));
        actions.bulk("priority", n === 0 ? null : (["URGENT", "HIGH", "MEDIUM", "LOW"] as const)[n - 1]!, selectedIds);
        return;
      }
    }
    actions.onItemKey(id, action);
  };
  useEffect(() => {
    if (!selectedIds.length) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) setSelectedIds([]);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedIds.length, setSelectedIds]);

  const bulkBar = (
    <>
      {selectedIds.length ? (
        <BulkBar
          count={selectedIds.length}
          actions={actions.bulkActions(selectedIds)}
          onAction={(id, value) => {
            if (id === "move" && (value === "__move" || value === "__copy")) {
              setTransfer(value === "__copy" ? "copy" : "move");
              return;
            }
            if (actions.bulk(id, value, selectedIds)) setSelectedIds([]);
          }}
          onClear={() => setSelectedIds([])}
        />
      ) : null}
      <Dialog open={!!transfer} onClose={() => setTransfer(null)} title={transfer === "copy" ? "Copy to project" : "Move to project"} width={380}>
        <ProjectPicker projects={picker.projects} action={transfer ?? "move"} count={selectedIds.length} showHeading={false} loadLists={picker.loadLists} onPick={(proj, list) => {
          const t = transfer;
          setTransfer(null);
          actions.transfer(selectedIds, proj, list, t === "copy");
          if (t === "move") setSelectedIds([]);
        }} />
      </Dialog>
      {dropTarget ? <AttachDrop projectId={projectId} target={dropTarget} onDone={() => setDropTarget(null)} /> : null}
    </>
  );
  const isSelected = (id: string) => selectedIds.includes(id);
  return { actions, dnd: { ...dnd, rootProps }, lists, rowsOf, allFiltered, hiddenCount, onItemSelect, onItemClick, onItemKey, bulkBar, isSelected };
}

function NoLists({ actions }: { actions: ProjectActions }) {
  const three = () => {
    actions.createList.mutate({ id: newId(), name: "To-do", statusRole: "TODO" });
    actions.createList.mutate({ id: newId(), name: "Doing", statusRole: "DOING" });
    actions.createList.mutate({ id: newId(), name: "Done", statusRole: "DONE" });
  };
  return (
    <div className="td-screen-canvas">
      <EmptyState icon="list" title="No lists in this project yet" hint="Add a list to start collecting items, or begin with the usual three." action={{ label: "Add a list", icon: "plus", shortcut: "shift N", onClick: () => actions.createList.mutate({ id: newId(), name: "To-do", statusRole: "TODO" }) }} secondary={{ label: "To-do · Doing · Done", onClick: three }} />
    </div>
  );
}

function NoMatches({ hidden, onReset }: { hidden: number; onReset: () => void }) {
  return (
    <div className="td-screen-canvas">
      <EmptyState icon="filter" title="No items match these filters" hint={`${hidden} item${hidden === 1 ? " is" : "s are"} hidden by the current filters.`} action={{ label: "Reset filters", icon: "x", shortcut: "X", onClick: onReset }} />
    </div>
  );
}

/** Item drag handlers and file-drop handlers on one root: files go to the file layer, in-app drags to the item layer. */
function mergeDrag(items: ItemDnd["rootProps"], files: ReturnType<typeof useFileDropTargets>): Partial<ItemDnd["rootProps"]> {
  const isFiles = (e: React.DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
  return {
    onDragEnter: (e: React.DragEvent) => (isFiles(e) ? files.onDragEnter?.(e) : undefined),
    onDragOver: (e: React.DragEvent) => (isFiles(e) ? files.onDragOver?.(e) : items.onDragOver(e)),
    onDragLeave: (e: React.DragEvent) => (isFiles(e) ? files.onDragLeave?.(e) : items.onDragLeave(e)),
    onDrop: (e: React.DragEvent) => (isFiles(e) ? files.onDrop?.(e) : items.onDrop(e)),
  } as Partial<ItemDnd["rootProps"]>;
}

/** Uploads files dropped on a card / row, then raises the toast. */
function AttachDrop({ projectId, target, onDone }: { projectId: string; target: { id: string; files: File[] }; onDone: () => void }) {
  const files = useAttachmentMutations(target.id, projectId);
  const notify = useFeedback((s) => s.notify);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    files.upload.mutate(target.files, {
      onSuccess: (made) => notify({ message: made.length === 1 ? `Attached ${made[0]!.name}` : `Attached ${made.length} files`, icon: "paperclip" }),
      onError: (e) => notify({ message: e.message, icon: "circle-alert" }),
      onSettled: onDone,
    });
  }, [files.upload, target, notify, onDone]);
  return null;
}

/** Section / column header callbacks shared by both views. */
function listCallbacks(actions: ProjectActions, listId: string, selectAll: () => void) {
  return {
    onRename: (name: string) => actions.updateList.mutate({ id: listId, name }),
    onIconChange: (icon: IconName | null) => actions.updateList.mutate({ id: listId, icon }),
    onStatusRoleChange: (role: ItemStatus | null) => actions.updateList.mutate({ id: listId, statusRole: role }),
    onHide: () => actions.updateList.mutate({ id: listId, hidden: true }),
    onSelectAll: selectAll,
  };
}

/** The touch long-press layer drives the same slot cue and drop as native drag-and-drop. */
function useTouchItemDrag(root: React.RefObject<HTMLDivElement | null>, dnd: ItemDnd, selector: string, move: ProjectActions["move"]) {
  useTouchDrag(root, {
    selector,
    onLift: (el) => (el.getAttribute("data-drag-id")?.includes("/") ? false : undefined),
    onMove: (p, d) => {
      dnd.cueAt(p.x, p.y, d.dragId);
    },
    onDrop: (p, d) => {
      const t = dnd.cueAt(p.x, p.y, d.dragId);
      dnd.end();
      if (t && d.dragId) move(d.dragId, t);
    },
    onCancel: dnd.end,
  });
}

function ProjectList(props: ViewProps) {
  const root = useRef<HTMLDivElement | null>(null);
  const v = useProjectView(props, root, { listSelector: ".td-lsec", itemSelector: ".td-lrow[data-drag-id]", cardsSelector: ".td-lsec-body" });
  const { actions } = v;
  if (!v.lists.length) return <NoLists actions={actions} />;
  if (v.allFiltered) return <NoMatches hidden={v.hiddenCount} onReset={props.clearFilters} />;
  return (
    <>
      <ListView ref={root} onAddList={() => actions.addList()} onItemKey={v.onItemKey} onMoveItem={actions.onMoveItemKey} onItemSelect={v.onItemSelect} rootProps={v.dnd.rootProps}>
        {v.lists.map((list) => {
          const rows = v.rowsOf(list.id);
          return (
            <ListSection key={list.id} listId={list.id} name={list.name} count={list.countLabel} icon={list.icon} statusRole={list.statusRole} quickAdd={actions.quickAdd} onAddItem={(title, parsed, position) => actions.addItem(list.id, title, parsed, position)} {...listCallbacks(actions, list.id, () => v.onItemSelect(rows.map((r) => r.id), "all"))}>
              {rows.map((r) => (
                <ListRow
                  key={r.id}
                  dragId={r.id}
                  title={r.title}
                  itemId={r.itemId}
                  done={r.done}
                  onDone={(done) => actions.setDone(r.id, done)}
                  labels={r.labels}
                  due={r.due}
                  dueState={r.dueState}
                  repeat={r.repeat}
                  priority={r.priority}
                  assignees={r.assignees}
                  attachments={r.attachments}
                  selected={v.isSelected(r.id)}
                  onClick={(e) => v.onItemClick(r.id, list.id, e)}
                  subitems={r.subitems.map((s) => ({ title: s.title, itemId: s.itemId, done: s.done, dragId: `${r.id}/${s.id}`, onDone: (done: boolean) => actions.setDone(s.id, done) }))}
                />
              ))}
            </ListSection>
          );
        })}
      </ListView>
      {v.bulkBar}
    </>
  );
}

function ProjectBoard(props: ViewProps) {
  const root = useRef<HTMLDivElement | null>(null);
  const v = useProjectView(props, root, { listSelector: ".td-list", itemSelector: ".td-card[data-drag-id]", cardsSelector: ".td-list-cards" });
  const { actions } = v;
  if (!v.lists.length) return <NoLists actions={actions} />;
  if (v.allFiltered) return <NoMatches hidden={v.hiddenCount} onReset={props.clearFilters} />;
  return (
    <>
      <BoardView ref={root} onAddList={() => actions.addList()} onItemKey={v.onItemKey} onMoveItem={actions.onMoveItemKey} onItemSelect={v.onItemSelect} rootProps={v.dnd.rootProps}>
        {v.lists.map((list) => {
          const rows = v.rowsOf(list.id);
          return (
            <ListColumn key={list.id} listId={list.id} name={list.name} count={list.countLabel} icon={list.icon} statusRole={list.statusRole} quickAdd={actions.quickAdd} onAddItem={(title, parsed) => actions.addItem(list.id, title, parsed)} {...listCallbacks(actions, list.id, () => v.onItemSelect(rows.map((r) => r.id), "all"))}>
              {rows.map((r) => {
                const it = props.items.find((x) => x.id === r.id);
                return (
                  <ItemCard
                    key={r.id}
                    dragId={r.id}
                    title={r.title}
                    itemId={r.itemId}
                    done={r.done}
                    labels={r.labels}
                    due={r.due}
                    dueState={r.dueState}
                    repeat={r.repeat}
                    priority={r.priority}
                    assignees={r.assignees}
                    selected={v.isSelected(r.id)}
                    onClick={(e) => v.onItemClick(r.id, list.id, e)}
                    cover={coverOf(it)}
                    badges={{ description: !!it?.description, attachments: r.attachments, checklist: r.subitems.length ? { done: r.subitems.filter((s) => s.done).length, total: r.subitems.length } : undefined }}
                    onMenuAction={(action) => {
                      if (action === "Delete") actions.remove(r.id);
                    }}
                  />
                );
              })}
            </ListColumn>
          );
        })}
      </BoardView>
      {v.bulkBar}
    </>
  );
}

/** Calendar: dated items (filters apply) on the grid; drag a chip to reschedule; "+" adds an item due that day. */
function ProjectCalendar({ projectId, project, items, labels, filters, openItem }: ViewProps) {
  const actions = useProjectActions(projectId, project, items, labels);
  const ctx = useMemo(() => ({ labels, people: peopleOf(project) }), [labels, project]);
  const calItems = useMemo<CalendarItem[]>(() => {
    const visibleListIds = new Set(actions.lists.map((l) => l.id));
    const subs = new Map<string, Item[]>();
    for (const it of items) if (it.parentItemId) subs.set(it.parentItemId, [...(subs.get(it.parentItemId) ?? []), it]);
    return items
      .filter((it) => !it.parentItemId && it.dueDate && visibleListIds.has(it.listId) && matchesFilters(it, filters, ctx))
      .map((it) => {
        const row = rowsForList([it, ...(subs.get(it.id) ?? [])], it.listId, { prefix: project.keyPrefix, labels, people: actions.people })[0]!;
        return { id: it.id, title: it.title, itemId: row.itemId, labels: row.labels.map((l) => (typeof l === "string" ? { color: l } : l)), done: it.done, due: it.dueDate, start: it.startDate, priority: row.priority, assignees: row.assignees.map((a) => (typeof a === "string" ? { name: a } : a)), subitems: row.subitems.map((s) => ({ id: s.id, title: s.title, itemId: s.itemId, done: s.done })), dueState: row.dueState };
      });
  }, [items, filters, ctx, actions.lists, actions.people, project.keyPrefix, labels]);
  if (!actions.lists.length) return <NoLists actions={actions} />;
  return <CalendarView items={calItems} onOpenItem={(id) => openItem(id)} onReschedule={actions.reschedule} onAddItem={actions.addItemOn} onToggleDone={actions.setDone} onToggleSubitem={(_item, sub, done) => actions.setDone(sub, done)} />;
}

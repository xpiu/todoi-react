// ProjectScreen — one project in the view the URL names: List (default), Board, Calendar. The URL
// also carries the filters and sort; selection lives here so it survives a view switch.
// Spec: DESIGN.md › Views, Filtering, Selection.
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";

import type { ItemStatus } from "../../shared/item-status";
import { ApiError, type Item, type Label, type ProjectDetail } from "../data/api";
import { newId } from "../data/mutations";
import { useLabels, useProject, useProjectItems } from "../data/queries";
import { BoardView } from "../design/board/BoardView";
import { ItemCard, type CardMenuAction } from "../design/board/ItemCard";
import type { BulkOption } from "../design/core/BulkBar";
import { MakeSubitemDialog } from "../design/core/ItemPicker";
import { ListColumn } from "../design/board/ListColumn";
import { useItemDnd, type ItemDnd } from "../design/board/useItemDnd";
import { isReadOnly } from "../design/auth/GuestBar";
import { CalendarView } from "../design/calendar/CalendarView";
import type { CalendarItem } from "../design/calendar/calendar";
import { BulkBar } from "../design/core/BulkBar";
import { EmptyState } from "../design/core/EmptyState";
import type { IconName } from "../design/core/Icon";
import type { SelectMode } from "../design/core/KeyNav";
import { isTyping, SHORTCUTS, type ItemAction } from "../design/core/shortcuts";
import { ViewSkeleton } from "../design/core/Skeleton";
import { useTouchDrag } from "../design/core/touchDrag";
import { ListRow } from "../design/list/ListRow";
import { ListSection } from "../design/list/ListSection";
import { ListView } from "../design/list/ListView";
import { nextViewSearch, type DecodedViewState } from "../design/navigation/viewState";
import { filterViewItems, itemComparator, sortLists } from "./filters";
import { coverOf, itemRowMapper, keyOf, pickableItems, pickableMember, rowsByList, rowsForList } from "./items";
import { ConfirmDialog } from "../design/core/Dialog";
import { statusById } from "../design/core/statuses";
import { count } from "../design/core/text";
import { HiddenListsMenu } from "../design/board/HiddenListsMenu";
import { TransferDialog, type TransferKind } from "../design/core/ProjectPicker";
import { useFileDropTargets } from "../design/overlay/Attachments";
import { attachFiles } from "./uploads";
import { ItemOverlayScreen } from "./ItemOverlayScreen";
import { CardQuickEdit } from "../design/board/CardQuickEdit";
import type { QuickField } from "../design/core/itemFields";
import { formatDate } from "../design/core/dates";
import { usePrefs } from "./prefs";
import { useProjectPicker } from "./useProjectPicker";
import { LoadFailed } from "./LoadFailed";
import { peopleOf } from "./session";
import { useToday } from "./today";
import { quote } from "./feedback";
import { useProjectActions, type ProjectActions } from "./useProjectActions";
import { useResolvedView } from "./useResolvedView";
import { useQuickAddRequest } from "./quickAddRequest";
import "./screens.css";

const projectRoute = getRouteApi("/app/p/$projectId");

export function ProjectScreen() {
  const { projectId } = projectRoute.useParams();
  const search = projectRoute.useSearch();
  const navigate = useNavigate();
  const project = useProject(projectId);
  const items = useProjectItems(projectId);
  const labels = useLabels(projectId);
  const { state, view } = useResolvedView(projectId, search, project.data?.defaultView);
  // Selection is per project: a different project reads as an empty selection.
  const [sel, setSel] = useState<{ pid: string; ids: string[] }>({ pid: projectId, ids: [] });
  const selectedIds = sel.pid === projectId ? sel.ids : [];
  const setSelectedIds = useCallback((next: string[] | ((prev: string[]) => string[])) => setSel((cur) => ({ pid: projectId, ids: typeof next === "function" ? next(cur.pid === projectId ? cur.ids : []) : next })), [projectId]);
  // Keep card callbacks stable when only item data changes.
  const go = useCallback((next: Partial<typeof state>) => void navigate({ to: "/p/$projectId", params: { projectId }, search: nextViewSearch(state, next) }), [navigate, projectId, state]);
  const openItem = useCallback((id: string, edit?: boolean) => go({ item: id, edit: !!edit }), [go]);

  const failed = project.isError ? project : items.isError ? items : labels.isError ? labels : null;
  if (failed && failed.error instanceof ApiError && failed.error.status === 401) {
    void navigate({ to: "/login", search: { next: location.pathname + location.search } });
    return null;
  }
  if (failed) return <LoadFailed what="this project" error={failed.error} onRetry={() => void failed.refetch()} />;
  if (!project.data || !items.data || !labels.data) return <ViewSkeleton view={view === "board" ? "board" : "list"} lists={project.data?.lists.length ?? 3} />;
  // A change to filters or sort leaves the saved view (the URL turns ad-hoc); opening an item keeps it.
  const props: ViewProps = {
    projectId,
    project: project.data,
    items: items.data,
    labels: labels.data,
    filters: state.filters,
    sort: state.sort,
    selectedIds,
    setSelectedIds,
    clearFilters: () => go({ filters: [] }),
    openItem,
  };
  const overlay = state.item ? <ItemOverlayScreen key={state.item} projectId={projectId} project={project.data} items={items.data} labels={labels.data} itemId={state.item} editTitle={state.edit} onClose={() => go({ item: undefined, edit: undefined })} onOpen={openItem} /> : null;
  const body = view === "board" ? <ProjectBoard {...props} /> : view === "calendar" ? <ProjectCalendar {...props} /> : <ProjectList {...props} />;
  return (
    <>
      {body}
      {overlay}
    </>
  );
}

/** What filters read: the project's labels and people, and today's date (Overdue, age windows). */
function useFilterContext(project: ProjectDetail, labels: Label[]) {
  const today = useToday();
  const members = project.members;
  return useMemo(() => ({ labels, people: peopleOf({ members }), today }), [labels, members, today]);
}

interface ViewProps {
  projectId: string;
  project: ProjectDetail;
  items: Item[];
  labels: Label[];
  filters: DecodedViewState["filters"];
  sort: DecodedViewState["sort"];
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
function useProjectView({ projectId, project, items, labels, filters, sort, selectedIds, setSelectedIds, openItem }: ViewProps, root: React.RefObject<HTMLDivElement | null>, dndOpts: { listSelector: string; itemSelector: string; cardsSelector: string; subitems?: boolean }) {
  const actions = useProjectActions(projectId, project, items, labels);
  // List view: subitem rows drag too — between an item's subitems, or onto another item's row (Design: ListScreen)
  const { subitems: dragSubitems, ...dndSelectors } = dndOpts;
  const dnd = useItemDnd(root, { ...dndSelectors, onDrop: actions.move, onDropSubitem: dragSubitems ? (id, t) => actions.moveSubitem(id, t.parentId, t.index ?? undefined) : undefined });
  useTouchItemDrag(root, dnd, dndOpts.itemSelector, !!dragSubitems);
  // Files dropped on a card or row attach to that item.
  const fileDrop = useFileDropTargets((files, id) => void attachFiles(id, projectId, files, items.find((it) => it.id === id)?.title), { selector: dndOpts.itemSelector });
  const rootProps = { ...dnd.rootProps, ...mergeDrag(dnd.rootProps, fileDrop) };
  // Move / Copy to another project: the selection (BulkBar) or one card (its ⋯ › Move to)
  const [transfer, setTransfer] = useState<{ kind: TransferKind; ids: string[] } | null>(null);
  // A card's ⋯ › Make subitem of…
  const [subitemFor, setSubitemFor] = useState<Item | null>(null);
  // A new Status role on a list with items waits for the review: existing items, or future moves only.
  const [roleReview, setRoleReview] = useState<{ list: VisibleList; role: ItemStatus } | null>(null);
  const picker = useProjectPicker(projectId);
  const anchor = useRef<string | null>(null);
  // Create › New item aimed at this project: quick-add opens in the first list once the lists are on screen
  const openFirstAdd = useCallback(() => requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>("[data-add-item]")?.click()), [root]);
  useQuickAddRequest(projectId, project.id === projectId && actions.lists.length > 0, openFirstAdd);

  const ctx = useFilterContext(project, labels);
  const showCompleted = usePrefs((s) => s.showCompleted);
  const visibleItems = useMemo(() => filterViewItems(items, filters, ctx, showCompleted), [items, filters, ctx, showCompleted]);
  const order = useMemo(() => itemComparator(sort.items), [sort.items]);
  const rowOptions = useMemo(() => ({ prefix: project.keyPrefix, labels, people: actions.people, order, today: ctx.today }), [project.keyPrefix, labels, actions.people, order, ctx.today]);
  const toRow = useMemo(() => itemRowMapper(rowOptions), [rowOptions]);
  const groupedRows = useMemo(() => rowsByList(visibleItems, rowOptions, toRow), [visibleItems, rowOptions, toRow]);
  const { itemsById, totals } = useMemo(() => {
    const byId = new Map<string, Item>();
    const counts = new Map<string, number>();
    for (const it of items) {
      byId.set(it.id, it);
      if (!it.parentItemId) counts.set(it.listId, (counts.get(it.listId) ?? 0) + 1);
    }
    return { itemsById: byId, totals: counts };
  }, [items]);
  const lists: VisibleList[] = sortLists(
    actions.lists.map((l) => {
      const total = totals.get(l.id) ?? 0;
      const shown = groupedRows.get(l.id)?.length ?? 0;
      return { id: l.id, name: l.name, icon: (l.icon as IconName | null) ?? null, statusRole: l.statusRole, total, count: shown, countLabel: filters.length ? `${shown} of ${total}` : shown };
    }),
    sort.lists,
  );
  const rowsOf = (listId: string) => groupedRows.get(listId) ?? [];
  const allFiltered = filters.length > 0 && lists.length > 0 && lists.every((l) => !l.count) && lists.some((l) => l.total);
  const hiddenCount = lists.reduce((n, l) => n + (l.total - l.count), 0);

  // Selection: S / shift+arrows / Ctrl+A from KeyNav, Ctrl+click toggles, shift+click ranges within a list.
  const onItemSelect = useCallback((ids: string[], mode: SelectMode) => {
    if (mode === "toggle") setSelectedIds((prev) => (ids.every((id) => prev.includes(id)) ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])]));
    else if (mode === "extend") setSelectedIds((prev) => [...new Set([...prev, ...ids])]);
    else setSelectedIds(ids);
    anchor.current = ids[ids.length - 1] ?? null;
  }, [setSelectedIds]);
  const onItemClick = useCallback((id: string, listId: string, e: SyntheticEvent) => {
    const me = e as unknown as { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean };
    if (me.ctrlKey || me.metaKey) {
      e.preventDefault();
      onItemSelect([id], "toggle");
    } else if (me.shiftKey && anchor.current) {
      e.preventDefault();
      // KeyNav already uses DOM order; the same visible order keeps range selection current
      // without making every card's callback depend on the entire items array.
      const list = root.current?.querySelector(`[data-list-id="${listId}"]`);
      const ids = [...(list?.querySelectorAll<HTMLElement>(dndOpts.itemSelector) ?? [])].map((el) => el.dataset.dragId!).filter((visibleId) => !visibleId.includes("/"));
      const a = ids.indexOf(anchor.current), b = ids.indexOf(id);
      if (a >= 0 && b >= 0) setSelectedIds((prev) => [...new Set([...prev, ...ids.slice(Math.min(a, b), Math.max(a, b) + 1)])]);
      else onItemSelect([id], "toggle");
    }
    else openItem(id);
  }, [root, dndOpts.itemSelector, onItemSelect, setSelectedIds, openItem]);
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

  // Keyboard users keep their place when a card leaves its column: its neighbour (next, else previous, else the column's
  // "Add an item") takes focus once the board has re-rendered; `follow` keeps focus on the card in its new list.
  const keepFocus = (id: string, follow = false) => {
    const sel = `${dndOpts.itemSelector}[data-drag-id="${CSS.escape(id)}"]`;
    const card = root.current?.querySelector<HTMLElement>(sel);
    const column = card?.closest(dndOpts.listSelector);
    const cards = column ? [...column.querySelectorAll<HTMLElement>(dndOpts.itemSelector)] : [];
    const at = card ? cards.indexOf(card) : -1;
    const neighbour = cards[at + 1] ?? cards[at - 1] ?? column?.querySelector<HTMLElement>("[data-add-item]") ?? null;
    setTimeout(() => (follow ? root.current?.querySelector<HTMLElement>(sel) : neighbour?.isConnected ? neighbour : null)?.focus(), 120);
  };
  const bulkBar = (
    <>
      {selectedIds.length ? (
        <BulkBar
          count={selectedIds.length}
          actions={actions.bulkActions(selectedIds)}
          onAction={(id, value) => {
            if (id === "move" && (value === "__move" || value === "__copy")) {
              setTransfer({ kind: value === "__copy" ? "copy" : "move", ids: selectedIds });
              return;
            }
            if (actions.bulk(id, value, selectedIds)) setSelectedIds([]);
          }}
          onClear={() => setSelectedIds([])}
        />
      ) : null}
      <TransferDialog kind={transfer?.kind ?? null} onClose={() => setTransfer(null)} projects={picker.projects} count={transfer?.ids.length ?? 1} loadLists={picker.loadLists} onPick={(kind, proj, list) => {
        const ids = transfer?.ids ?? [];
        if (kind === "move" && ids.length === 1) keepFocus(ids[0]!);
        void actions.transfer(ids, proj, list, kind === "copy");
        if (kind === "move") setSelectedIds((prev) => prev.filter((id) => !ids.includes(id)));
      }} />
      <MakeSubitemDialog
        open={!!subitemFor}
        title={subitemFor ? `Make ${quote(subitemFor.title)} a subitem of` : "Make subitem of"}
        onClose={() => setSubitemFor(null)}
        items={subitemFor ? pickableItems(items, project).filter((p) => p.id !== subitemFor.id) : []}
        onPick={(parent) => {
          if (!subitemFor) return;
          keepFocus(subitemFor.id);
          actions.makeSubitemOf(subitemFor, parent);
        }}
      />
    </>
  );
  const requestRole = (list: VisibleList, role: ItemStatus | null) => {
    if (role === list.statusRole) return;
    // Removing a role, or a role on an empty list, rewrites nothing: no review needed.
    if (role && list.total) setRoleReview({ list, role });
    else actions.setListRole(list.id, role);
  };
  const review = roleReview;
  const roleDialog = (
    <ConfirmDialog
      open={!!review}
      title={review ? `Apply ${statusById(review.role)?.name ?? review.role} to the ${count(review.list.total, "item")} already in “${review.list.name}”?` : ""}
      body={`Changing a list's Status role never rewrites items on its own. Apply it to ${review?.list.total === 1 ? "this item" : "these items"} in one action, or leave ${review?.list.total === 1 ? "it" : "them"} as they are and use the role for future moves only.`}
      confirmLabel="Apply to existing items"
      cancelLabel="Future moves only"
      onConfirm={() => {
        setRoleReview(null);
        if (review) actions.setListRole(review.list.id, review.role, true);
      }}
      // Esc, the backdrop and "Future moves only" all keep the role and leave every item as it is.
      onClose={() => {
        setRoleReview(null);
        if (review) actions.setListRole(review.list.id, review.role);
      }}
    />
  );
  const hiddenMenu = <HiddenListsMenu lists={actions.hiddenLists.map((l) => ({ id: l.id, name: l.name, count: totals.get(l.id) ?? 0 }))} onShow={actions.showLists} />;
  const isSelected = (id: string) => selectedIds.includes(id);
  // A board card's ⋯ menu, on the existing item actions: Rename opens the item with its title in edit (the E key),
  // Move to reuses the BulkBar's list move and project transfer, Duplicate / Archive / Make subitem of the overlay's.
  const cardMenuRef = useRef<(it: Item, action: CardMenuAction, value?: string) => void>(() => {});
  useLayoutEffect(() => {
    cardMenuRef.current = (it, action, value) => {
      if (action === "Rename") openItem(it.id, true);
      else if (action === "Move to" && (value === "__move" || value === "__copy")) setTransfer({ kind: value === "__copy" ? "copy" : "move", ids: [it.id] });
      else if (action === "Move to" && value && value !== it.listId) {
        keepFocus(it.id, true);
        actions.bulk("move", value, [it.id]);
      }
      else if (action === "Duplicate") void actions.copyItems([it.id], { projectId, listId: it.listId, name: null });
      else if (action === "Make subitem of") setSubitemFor(it);
      else if (action === "Archive") {
        keepFocus(it.id);
        actions.archive(it);
      } else if (action === "Delete") {
        keepFocus(it.id);
        void actions.remove(it.id);
      }
    };
  });
  const parentsWithSubitems = useMemo(() => new Set(items.flatMap((it) => (it.parentItemId ? [it.parentItemId] : []))), [items]);
  const onCardMenu = useCallback((it: Item, action: CardMenuAction, value?: string) => cardMenuRef.current(it, action, value), []);
  const { moveOptions } = actions;
  const moveOptionsByList = useMemo(() => new Map(lists.map((l) => [l.id, moveOptions(l.id)])), [lists, moveOptions]);
  return { actions, dnd: { ...dnd, rootProps }, lists, rowsOf, itemsById, toRow, allFiltered, hiddenCount, onItemSelect, onItemClick, onItemKey, onCardMenu, moveOptionsByList, parentsWithSubitems, bulkBar: <>{bulkBar}{roleDialog}</>, isSelected, requestRole, hiddenMenu };
}

function NoLists({ actions }: { actions: ProjectActions }) {
  const hidden = actions.hiddenLists;
  if (hidden.length)
    return (
      <div className="td-screen-canvas">
        <EmptyState icon="eye-off" title={hidden.length === 1 ? `“${hidden[0]!.name}” is hidden` : `All ${hidden.length} lists are hidden`} hint="Hidden lists keep their items and are hidden for everyone in this project. Show them again, or add a new list." action={{ label: hidden.length === 1 ? "Show the list" : "Show all lists", icon: "eye", onClick: () => actions.showLists(hidden.map((l) => l.id)) }} secondary={{ label: "Add a list", onClick: () => actions.addList() }} />
      </div>
    );
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

/** Section / column header callbacks shared by both views. */
function listCallbacks(actions: ProjectActions, list: VisibleList, selectAll: () => void, requestRole: (list: VisibleList, role: ItemStatus | null) => void) {
  const listId = list.id;
  return {
    onRename: (name: string) => actions.updateList.mutate({ id: listId, name }),
    onIconChange: (icon: IconName | null) => actions.updateList.mutate({ id: listId, icon }),
    onStatusRoleChange: (role: ItemStatus | null) => requestRole(list, role),
    onHide: () => actions.hideList(listId),
    onSelectAll: selectAll,
  };
}

/** The touch long-press layer drives the same slot cue and drop as native drag-and-drop. */
function useTouchItemDrag(root: React.RefObject<HTMLDivElement | null>, dnd: ItemDnd, selector: string, subitems: boolean) {
  useTouchDrag(root, {
    selector,
    onLift: (el) => (isReadOnly(el) || (!subitems && el.getAttribute("data-drag-id")?.includes("/")) ? false : undefined),
    onMove: (p, d) => {
      dnd.cueAt(p.x, p.y, d.dragId);
    },
    onDrop: (p, d) => {
      const t = dnd.cueAt(p.x, p.y, d.dragId);
      dnd.end();
      if (t && d.dragId) dnd.drop(d.dragId, t);
    },
    onCancel: dnd.end,
  });
}

function ProjectList(props: ViewProps) {
  const root = useRef<HTMLDivElement | null>(null);
  const v = useProjectView(props, root, { listSelector: ".td-list-section", itemSelector: ".td-list-row[data-drag-id]", cardsSelector: ".td-list-section-body", subitems: true });
  const { actions } = v;
  if (!v.lists.length) return <NoLists actions={actions} />;
  if (v.allFiltered) return <NoMatches hidden={v.hiddenCount} onReset={props.clearFilters} />;
  return (
    <>
      <ListView ref={root} onAddList={() => actions.addList()} after={v.hiddenMenu} onItemKey={v.onItemKey} onMoveItem={actions.onMoveItemKey} onItemSelect={v.onItemSelect} rootProps={v.dnd.rootProps}>
        {v.lists.map((list) => {
          const rows = v.rowsOf(list.id);
          return (
            <ListSection key={list.id} listId={list.id} name={list.name} count={list.countLabel} icon={list.icon} statusRole={list.statusRole} quickAdd={actions.quickAdd} onAddItem={(title, parsed, position) => actions.addItem(list.id, title, parsed, position)} {...listCallbacks(actions, list, () => v.onItemSelect(rows.map((r) => r.id), "all"), v.requestRole)}>
              {rows.map((r) => (
                <ListRow
                  key={r.id}
                  dragId={r.id}
                  title={r.title}
                  itemId={r.itemId}
                  done={r.done}
                  onDone={(done) => actions.setDone(r.id, done)}
                  onRename={(title) => actions.rename(r.id, title)}
                  labels={r.labels}
                  due={r.due}
                  dueState={r.dueState}
                  repeat={r.repeat}
                  priority={r.priority}
                  assignees={r.assignees}
                  attachments={r.attachments}
                  selected={v.isSelected(r.id)}
                  onClick={(e) => v.onItemClick(r.id, list.id, e)}
                  subitems={r.subitems.map((s) => ({ title: s.title, itemId: s.itemId, done: s.done, dragId: `${r.id}/${s.id}`, onDone: (done: boolean) => actions.setDone(s.id, done), onRename: (title: string) => actions.rename(s.id, title) }))}
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

/** How a card's quick picker was opened: its details-row icon, its due pill, or a key (A, L, Shift+D) */
type QuickVia = "icon" | "badge" | "key";
type OpenQuick = (id: string, field: QuickField, anchor: HTMLElement, source: QuickVia) => void;

/**
 * The Board's inline quick pickers (Design: board/CardQuickEdit): a card's quick-action icon or due pill opens that
 * field's picker at it; the board stays in view. One picker at a time; `rowId` is the card whose details row stays open
 * (through the picker, and after a pick so the next icon is one Tab away) until a press lands outside it.
 */
function useCardQuickEdit(root: React.RefObject<HTMLDivElement | null>) {
  const [quick, setQuick] = useState<{ id: string; field: QuickField; via: QuickVia } | null>(null);
  const [rowId, setRowId] = useState<string | null>(null);
  const quickRef = useRef(quick);
  useEffect(() => {
    quickRef.current = quick;
  });
  const anchor = useRef<HTMLElement | null>(null);
  const focusAfter = useRef<{ id: string; field?: QuickField } | null>(null);
  const cardOf = useCallback((id: string) => root.current?.querySelector<HTMLElement>(`.td-card[data-drag-id="${CSS.escape(id)}"]`) ?? null, [root]);
  const open: OpenQuick = useCallback((id, field, el, via) => {
    const q = quickRef.current;
    // The pressed icon toggles its picker closed
    if (q && q.id === id && q.field === field) {
      quickRef.current = null;
      setQuick(null);
      return;
    }
    anchor.current = el;
    if (via !== "badge") setRowId(id);
    quickRef.current = { id, field, via };
    setQuick({ id, field, via });
  }, []);
  const close = (reason?: string) => {
    const q = quickRef.current;
    if (!q) return;
    quickRef.current = null;
    setQuick(null);
    // Esc steps back one level: to the ⋯ menu when the picker came from its row, else closed with focus on the card
    if (reason === "escape" && q.via !== "badge") {
      setRowId(null);
      if (q.via === "icon") {
        cardOf(q.id)?.querySelector<HTMLElement>(".td-card-more")?.click();
        return;
      }
    }
    // A pick from the row hands focus back to its icon (the row stays); a key or the pill, to the card
    if (reason !== "outside") focusAfter.current = { id: q.id, field: q.via === "icon" && reason !== "escape" ? q.field : undefined };
  };
  useEffect(() => {
    const f = focusAfter.current;
    if (quick || !f) return;
    focusAfter.current = null;
    const card = cardOf(f.id);
    const icon = f.field ? card?.querySelector<HTMLElement>(`.td-card-qa[data-field="${f.field}"]`) : null;
    (icon ?? card)?.focus();
  }, [quick, cardOf]);
  // A press outside the held row's card (and outside any picker) collapses it
  useEffect(() => {
    if (!rowId) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t?.closest || cardOf(rowId)?.contains(t) || t.closest(".td-popover, .td-sheet-backdrop")) return;
      setRowId(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [rowId, cardOf]);
  // A, L and Shift+D on a focused card open Assignees, Labels and Dates at their icons. Runs before KeyNav (its
  // onKeyDown), so Shift+D never reaches "done"; L right after G belongs to the G chord (G then L: List view).
  const gAt = useRef(0);
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (isTyping(t)) return;
    if (SHORTCUTS.is("chord-g", e)) {
      gAt.current = e.timeStamp;
      return;
    }
    const chord = gAt.current && e.timeStamp - gAt.current < 1000;
    gAt.current = 0;
    const k = chord ? null : SHORTCUTS.itemQuickEdit(e);
    const card = k ? t.closest<HTMLElement>(".td-card[data-drag-id]") : null;
    if (!k || !card) return;
    const field: QuickField = k === "dates" ? "due" : k;
    const icon = card.querySelector<HTMLElement>(`.td-card-qa[data-field="${field}"]`);
    if (!icon) return;
    e.preventDefault();
    open(card.dataset.dragId!, field, icon, "key");
  };
  return { quick, rowId, anchor, open, close, onKey };
}

/** Raw immutable item records and stable callbacks let unchanged cards skip a board update. */
const ProjectBoardItem = memo(function ProjectBoardItem({ item, toRow, subitemTotal, subitemDone, hasSubitems, selected, onClick, onMenu, moveOptions, onQuickAction, quick, detailsOpen }: {
  item: Item;
  toRow: ReturnType<typeof itemRowMapper>;
  subitemTotal: number;
  subitemDone: number;
  selected: boolean;
  onClick: (id: string, listId: string, e: SyntheticEvent) => void;
  onMenu: (it: Item, action: CardMenuAction, value?: string) => void;
  hasSubitems: boolean;
  moveOptions?: BulkOption[];
  onQuickAction: OpenQuick;
  /** This card's open quick picker */
  quick: { field: QuickField; via: QuickVia } | null;
  detailsOpen: boolean;
}) {
  const r = toRow(item);
  return <ItemCard
    dragId={item.id}
    title={r.title}
    itemId={r.itemId}
    pendingId={item.version === 0 && item.projectId !== null && item.keyNumber === null}
    done={r.done}
    labels={r.labels}
    due={r.due}
    dueState={r.dueState}
    repeat={r.repeat}
    priority={r.priority}
    assignees={r.assignees}
    selected={selected}
    onClick={(e) => onClick(item.id, item.listId, e)}
    cover={coverOf(item)}
    badges={{ description: !!item.description, attachments: r.attachments, checklist: subitemTotal ? { done: subitemDone, total: subitemTotal } : undefined }}
    onMenuAction={(action, _id, value) => onMenu(item, action, value)}
    moveOptions={moveOptions}
    hasSubitems={hasSubitems}
    created={formatDate(item.createdAt, { year: "auto" })}
    onQuickAction={(field, anchor, source) => onQuickAction(item.id, field, anchor, source)}
    activeQuickAction={quick?.field ?? null}
    quickActionAnchor={quick?.via === "badge" ? "badge" : "icon"}
    detailsOpen={detailsOpen}
  />;
});

function ProjectBoard(props: ViewProps) {
  const root = useRef<HTMLDivElement | null>(null);
  const v = useProjectView(props, root, { listSelector: ".td-list-column", itemSelector: ".td-card[data-drag-id]", cardsSelector: ".td-list-column-cards" });
  const { actions } = v;
  const qe = useCardQuickEdit(root);
  const today = useToday();
  const quickItem = qe.quick ? v.itemsById.get(qe.quick.id) : undefined;
  const members = useMemo(() => actions.people.map(pickableMember), [actions.people]);
  if (!v.lists.length) return <NoLists actions={actions} />;
  if (v.allFiltered) return <NoMatches hidden={v.hiddenCount} onReset={props.clearFilters} />;
  return (
    <>
      <BoardView ref={root} onAddList={() => actions.addList()} after={v.hiddenMenu} onItemKey={v.onItemKey} onMoveItem={actions.onMoveItemKey} onItemSelect={v.onItemSelect} onKeyDown={qe.onKey} rootProps={v.dnd.rootProps}>
        {v.lists.map((list) => {
          const rows = v.rowsOf(list.id);
          return (
            <ListColumn key={list.id} listId={list.id} name={list.name} count={list.countLabel} icon={list.icon} statusRole={list.statusRole} quickAdd={actions.quickAdd} onAddItem={(title, parsed, position) => actions.addItem(list.id, title, parsed, position)} {...listCallbacks(actions, list, () => v.onItemSelect(rows.map((r) => r.id), "all"), v.requestRole)}>
              {rows.map((r) => {
                const it = v.itemsById.get(r.id)!;
                return (
                  <ProjectBoardItem
                    key={r.id}
                    item={it}
                    toRow={v.toRow}
                    subitemTotal={r.subitems.length}
                    subitemDone={r.subitems.filter((s) => s.done).length}
                    hasSubitems={v.parentsWithSubitems.has(r.id)}
                    selected={v.isSelected(r.id)}
                    onClick={v.onItemClick}
                    onMenu={v.onCardMenu}
                    moveOptions={v.moveOptionsByList.get(it.listId)}
                    onQuickAction={qe.open}
                    quick={qe.quick?.id === r.id ? qe.quick : null}
                    detailsOpen={qe.rowId === r.id}
                  />
                );
              })}
            </ListColumn>
          );
        })}
      </BoardView>
      {qe.quick && quickItem ? (
        <CardQuickEdit
          key={`${qe.quick.id}:${qe.quick.field}`}
          field={qe.quick.field}
          anchorRef={qe.anchor}
          item={{ id: quickItem.id, itemId: keyOf(quickItem, props.project.keyPrefix), title: quickItem.title, listId: quickItem.listId, start: quickItem.startDate, due: quickItem.dueDate, time: quickItem.dueTime, labelIds: quickItem.labelIds, assigneeIds: quickItem.assigneeIds, priority: quickItem.priority, status: quickItem.status, done: quickItem.done, recurring: !!(quickItem.repeatRule && quickItem.dueDate) }}
          labels={props.labels}
          members={members}
          lists={actions.lists}
          linkStatuses={props.project.linkStatuses}
          today={today}
          onClose={qe.close}
          onSetDates={actions.quickEdit.setDates}
          onSetPriority={actions.quickEdit.setPriority}
          onSetStatus={actions.quickEdit.setStatus}
          onMoveToList={actions.quickEdit.moveToList}
          onSetLabels={actions.quickEdit.setLabels}
          onSetAssignees={actions.quickEdit.setAssignees}
          onSessionEnd={actions.quickEdit.endSession}
          {...actions.labelHandlers}
        />
      ) : null}
      {v.bulkBar}
    </>
  );
}

/** Calendar: dated items (filters apply) on the grid; drag a chip to reschedule; "+" adds an item due that day. */
function ProjectCalendar({ projectId, project, items, labels, filters, openItem }: ViewProps) {
  const actions = useProjectActions(projectId, project, items, labels);
  const ctx = useFilterContext(project, labels);
  const { today } = ctx;
  const showCompleted = usePrefs((s) => s.showCompleted);
  const calItems = useMemo<CalendarItem[]>(() => {
    const visibleListIds = new Set(actions.lists.map((l) => l.id));
    const subs = new Map<string, Item[]>();
    for (const it of items) if (it.parentItemId) subs.set(it.parentItemId, [...(subs.get(it.parentItemId) ?? []), it]);
    return filterViewItems(items, filters, ctx, showCompleted)
      .filter((it) => !it.parentItemId && it.dueDate && visibleListIds.has(it.listId))
      .map((it) => {
        const row = rowsForList([it, ...(subs.get(it.id) ?? [])], it.listId, { prefix: project.keyPrefix, labels, people: actions.people, today })[0]!;
        return { id: it.id, title: it.title, itemId: row.itemId, labels: row.labels.map((l) => (typeof l === "string" ? { color: l } : l)), done: it.done, due: it.dueDate, start: it.startDate, priority: row.priority, assignees: row.assignees.map((a) => (typeof a === "string" ? { name: a } : a)), subitems: row.subitems.map((s) => ({ id: s.id, title: s.title, itemId: s.itemId, done: s.done })), dueState: row.dueState };
      });
  }, [items, filters, ctx, showCompleted, actions.lists, actions.people, project.keyPrefix, labels, today]);
  if (!actions.lists.length) return <NoLists actions={actions} />;
  return <CalendarView items={calItems} today={today} onOpenItem={(id) => openItem(id)} onReschedule={actions.reschedule} onAddItem={actions.addItemOn} onToggleDone={actions.setDone} onToggleSubitem={(_item, sub, done) => actions.setDone(sub, done)} />;
}

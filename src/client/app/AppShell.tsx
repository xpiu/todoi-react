// AppShell — the frame around every app screen: TopNavbar (with the project's SubNavbar hoisted in
// on desktop), Sidebar, the content, the one Toast, the ? dialog and the Ctrl+K palette. The URL is
// the single source of truth for the current project and view. Spec: DESIGN.md › Responsive.
import { Outlet, useLocation, useMatch, useNavigate } from "@tanstack/react-router";
import { useEffect, useId, useState } from "react";

import { newId, useCreateList } from "../data/mutations";
import { useQuery } from "@tanstack/react-query";

import { listItemsQuery, projectsOf, useGroups, useInboxUnread, useLabels, useProject, useProjectItems } from "../data/queries";
import { explain, type SearchHit } from "../data/api";
import { useAppearance } from "../design/core/appearance";
import { SHORTCUTS } from "../design/core/shortcuts";
import { ShortcutHint, useShortcutHints } from "../design/core/ShortcutHint";
import { Toast } from "../design/core/Toast";
import { ToastPortalProvider } from "../design/core/ToastPortal";
import { useViewport } from "../design/core/viewport";
import { FilterBar } from "../design/navigation/FilterBar";
import { FilterMenu } from "../design/navigation/FilterMenu";
import { MembersMenu } from "../design/navigation/MembersMenu";
import { DEFAULT_NAV, Sidebar } from "../design/navigation/Sidebar";
import { SortBar } from "../design/navigation/SortBar";
import { SortMenu } from "../design/navigation/SortMenu";
import { SubNavbar, type SubNavbarMenu } from "../design/navigation/SubNavbar";
import { TopNavbar } from "../design/navigation/TopNavbar";
import { encodeViewState, nextViewSearch, sameDefinition, type ViewDefinition } from "../design/navigation/viewState";
import { SavedViewTabs } from "../design/navigation/SavedViewTabs";
import { useSavedViewMutations } from "../data/savedViews";
import { useResolvedView } from "./useResolvedView";
import { usePersistedFlag } from "./usePersistedFlag";
import { projectUrl } from "./links";
import { count } from "../design/core/text";
import { CommandPalette } from "../design/overlay/CommandPalette";
import { ShortcutsDialog } from "../design/overlay/ShortcutsDialog";
import { copyAndNotify, quote, useFeedback } from "./feedback";
import { downloadText, fileSlug, itemsToCsv, viewToMarkdown } from "./exportData";
import { availableFilters, FILTER_SECTIONS, filterKey, matchesFilters, nextSort, sameFilter, SORT_OPTS, type SortDim } from "./filters";
import { keyOf } from "./items";
import { useLifecycle, useRemoveProject } from "./lifecycle";
import { LifecycleDialogs } from "./LifecycleDialogs";
import { useProjectMutations } from "../data/projects";
import { avatarColorVar, peopleOf, useCurrentUser } from "./session";
import { authClient, forgetBrowserSession } from "../auth";
import { GuestBar } from "../design/auth/GuestBar";
import { useAppShortcuts } from "./useAppShortcuts";
import { hitContext, hitKey, useItemSearch, useOpenResult } from "./search";
import { useInbox } from "./inbox";
import { useDateConventionsKey, usePrefs, usePrefsSync } from "./prefs";
import { useLeaveGuard, useSaveState } from "./saveState";
import { useFreshness } from "./freshness";
import { useToday } from "./today";
import { ConnectionStatus } from "../design/core/ConnectionStatus";
import "./AppShell.css";

const SIDEBAR_KEY = "td-sidebar-open";
const SAVED_VIEWS_KEY = "td-saved-views-open";
const SORT_DIMS: ReadonlyArray<[string, SortDim]> = [
  ["Lists", "lists"],
  ["Items", "items"],
];

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const vp = useViewport();
  const ap = useAppearance();
  const groups = useGroups();
  const unread = useInboxUnread();
  const projectMatch = useMatch({ from: "/app/p/$projectId", shouldThrow: false });
  const projectId = projectMatch?.params.projectId;
  const project = useProject(projectId ?? "");
  const projectItems = useProjectItems(projectId ?? "");
  const projectLabels = useLabels(projectId ?? "");
  const createList = useCreateList(projectId ?? "");
  const lifecycle = useLifecycle();
  const { user } = useCurrentUser();
  const signedIn = !!user && !user.isAnonymous;
  usePrefsSync(!!user);
  useFreshness(!!user);
  const today = useToday();
  const inboxBadge = usePrefs((s) => s.inboxBadge);
  const conventions = useDateConventionsKey();
  const save = useSaveState();
  useLeaveGuard(save.unsafeToLeave);
  const myRole = user ? project.data?.members.find((m) => m.userId === user.id)?.role : undefined;
  // Project members can edit unless their role is Viewer; nonmembers read only.
  const readonly = !!projectId && !!project.data && (!myRole || myRole === "viewer");
  const guestReason: "public" | "viewer" | null = !readonly ? null : myRole === "viewer" ? "viewer" : "public";
  const pm = useProjectMutations();
  const removeProject = useRemoveProject();
  const toast = useFeedback((s) => s.toast);
  const dismiss = useFeedback((s) => s.dismiss);
  const setUndoScope = useFeedback((s) => s.setScope);
  const [desktopSidebar, setDesktopSidebar] = usePersistedFlag(SIDEBAR_KEY, true);
  const [overlaySidebar, setOverlaySidebar] = useState(false);
  const sidebarOpen = vp.desktop ? desktopSidebar : overlaySidebar;
  const setSidebarOpen = vp.desktop ? setDesktopSidebar : setOverlaySidebar;
  const [helpOpen, setHelpOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [navSearch, setNavSearch] = useState({ query: "", open: false });
  const navHits = useItemSearch(navSearch.query, navSearch.open);
  const paletteHits = useItemSearch(paletteQuery, paletteOpen);
  // The Inbox section of the dropdown before anything is typed.
  const inboxPreview = useQuery({ ...listItemsQuery(), enabled: navSearch.open && !navSearch.query.trim() });
  const openResult = useOpenResult();
  // "Suggest shortcuts": nudges after pointer actions a key could have done.
  const hints = useShortcutHints(ap.suggestShortcuts);
  const suggest = hints.suggest;
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t?.closest) return;
      if (t.closest("[data-add-item]")) suggest("add-item");
      else if (t.closest(".td-listview-addlist, .td-board-addlist")) suggest("add-list");
    };
    const onDrop = (e: DragEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.(".td-board, .td-listview")) suggest("move-item");
    };
    document.addEventListener("click", onClick);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("drop", onDrop);
    };
  }, [suggest]);
  // The undo history is per project / screen.
  const undoScope = projectId ?? location.pathname;
  useEffect(() => setUndoScope(undoScope), [undoScope, setUndoScope]);

  const section = location.pathname.split("/")[1] ?? "";
  // On the Inbox, a row dropped on a sidebar project is filed there.
  const inbox = useInbox(section === "inbox");
  const capture = () => void navigate({ to: "/inbox", search: { capture: true } });
  const activeId = projectId ?? (section === "inbox" || section === "projects" || section === "groups" ? section : undefined);
  const title = projectId ? (project.data?.name ?? "") : section === "inbox" ? "Inbox" : section === "projects" ? "Projects" : section === "groups" ? "Project groups" : section === "settings" ? "Settings" : section === "account" ? "Account" : "Todoi";

  const resolved = useResolvedView(projectId ?? "", projectMatch?.search ?? {}, project.data?.defaultView);
  const state = projectMatch ? resolved.state : null;
  const view = resolved.view;
  const svm = useSavedViewMutations(projectId ?? "");
  // The saved-views row: remembered per device; opens by itself when a saved-view link loads.
  const [savedViewsOpen, setSavedViewsOpen] = usePersistedFlag(SAVED_VIEWS_KEY, false);
  // The saved-views row and the SubNavbar's Views toggle (its aria-controls) share this id.
  const savedViewsId = useId();
  const linkedView = resolved.raw.savedView;
  useEffect(() => {
    if (linkedView) setSavedViewsOpen(true);
  }, [linkedView, setSavedViewsOpen]);
  // The SubNavbar's one open dropdown: the Filter / Sort rows list every option while theirs is open.
  const [openMenu, setOpenMenu] = useState<SubNavbarMenu | null>(null);
  const closeMenu = (m: SubNavbarMenu) => setOpenMenu((cur) => (cur === m ? null : cur));
  // The tab stays active (with a dot) while the live state drifts from its definition.
  const [lastSaved, setLastSaved] = useState<{ projectId: string; id: string } | null>(null);
  const activeSavedId = resolved.raw.savedView ?? (lastSaved && lastSaved.projectId === projectId ? lastSaved.id : null);
  const activeSaved = resolved.savedViews.find((v) => v.id === activeSavedId) ?? null;
  const currentDef: ViewDefinition = { view, filters: state?.filters ?? [], sort: state?.sort ?? {} };
  const svDirty = !!activeSaved && !sameDefinition(activeSaved.definition, currentDef);
  const goSaved = (id: string | null) => {
    if (!projectId) return;
    setLastSaved(id ? { projectId, id } : null);
    void navigate({ to: "/p/$projectId", params: { projectId }, search: id ? { view: id, item: state?.item } : { item: state?.item } });
  };
  const setView = (v: string) => {
    if (!projectId || !state) return;
    suggest(`view-${v}`);
    void navigate({ to: "/p/$projectId", params: { projectId }, search: encodeViewState({ ...state, view: v as typeof view, savedView: undefined }) });
  };
  const setViewState = (patch: Partial<typeof state & object>) => {
    if (!projectId || !state) return;
    if (resolved.raw.savedView) setLastSaved({ projectId, id: resolved.raw.savedView });
    void navigate({ to: "/p/$projectId", params: { projectId }, search: nextViewSearch(state, patch) });
  };
  const clearFilters = () => setViewState({ filters: [] });
  const toggleFilter = (f: { type: string; value: string }) => setViewState({ filters: state!.filters.some((a) => sameFilter(a, f)) ? state!.filters.filter((a) => !sameFilter(a, f)) : [...state!.filters, { type: f.type, value: f.value }] });
  const selectSort = (dim: string, key: string) => setViewState({ sort: nextSort(state!.sort, dim as SortDim, key) });

  // Filter options and their match counts over the project's top-level items.
  const topItems = (projectItems.data ?? []).filter((it) => !it.parentItemId);
  const filterCtx = { labels: projectLabels.data ?? [], people: peopleOf(project.data), today };
  const available = availableFilters(filterCtx.labels, filterCtx.people);
  const counts = Object.fromEntries(available.map((f) => [filterKey(f), topItems.filter((it) => matchesFilters(it, [f], filterCtx)).length]));
  const filters = state?.filters ?? [];
  const sort = state?.sort ?? { lists: null, items: null };
  const sortActive = (["lists", "items"] as const).filter((d) => sort[d]);
  // The Filter row offers the quick filters (labels, Overdue) plus whatever else is active.
  const barAvailable = [...available.filter((f) => f.type === "label" || f.type === "due"), ...filters.filter((f) => f.type !== "label" && f.type !== "due").map((f) => available.find((a) => sameFilter(a, f)) ?? f)];
  const resetSort = () => setViewState({ sort: { lists: null, items: null } });
  const notify = useFeedback((s) => s.notify);
  const logout = () => void authClient.signOut().then(({ error }) => {
    if (error) notify({ message: `Couldn't log out: ${error.message ?? "the server refused the request"}`, icon: "circle-alert" });
    else {
      forgetBrowserSession();
      window.location.assign("/");
    }
  });
  const exportView = (format: "pdf" | "md" | "csv") => {
    const p = project.data;
    if (!p) return;
    if (format === "pdf") {
      window.print();
      return;
    }
    const visible = topItems.filter((it) => matchesFilters(it, filters, filterCtx));
    const ctx = { prefix: p.keyPrefix, labels: filterCtx.labels, people: filterCtx.people, listName: (id: string) => p.lists.find((l) => l.id === id)?.name ?? "" };
    const lists = p.lists.filter((l) => !l.hidden).map((l) => ({ name: l.name, items: visible.filter((it) => it.listId === l.id) }));
    const slug = fileSlug(`${p.name} ${view}`);
    if (format === "md") downloadText(`${slug}.md`, viewToMarkdown(p.name, lists, ctx), "text/markdown");
    else downloadText(`${slug}.csv`, itemsToCsv(lists.flatMap((l) => l.items), ctx), "text/csv");
    notify({ message: `Exported “${p.name}” ${view} view as ${format.toUpperCase()} — ${count(visible.length, "item")}`, icon: "download" });
  };
  const savedViewsRow =
    projectId && savedViewsOpen ? (
      <SavedViewTabs
        id={savedViewsId}
        onHide={() => setSavedViewsOpen(false)}
        views={resolved.savedViews}
        activeId={activeSavedId}
        dirty={svDirty}
        canSave={(filters.length > 0 || sortActive.length > 0) && (!activeSaved || svDirty)}
        currentDef={currentDef}
        onSelect={goSaved}
        onSave={async (name, shared) => {
          const id = newId();
          await svm.create.mutateAsync({ id, name, shared, definition: currentDef, quiet: true }).catch(explain);
          notify({ message: `Saved the view ${quote(name)}`, icon: "bookmark-plus" });
          goSaved(id);
        }}
        onAction={(id, action, value) => {
          const v = resolved.savedViews.find((x) => x.id === id);
          if (!v) return;
          if (action === "copy-link") {
            void copyAndNotify(projectUrl(projectId, `?view=${id}`), `Copied the link to ${quote(v.name)}`);
          } else if (action === "update") {
            svm.update.mutate({ id, definition: currentDef }, { onSuccess: () => {
              goSaved(id);
              notify({ message: `Updated ${quote(v.name)} with the current filters and sort`, icon: "save" });
            } });
          } else if (action === "rename" && typeof value === "string") svm.update.mutate({ id, name: value });
          else if (action === "share" && typeof value === "boolean") {
            svm.update.mutate({ id, shared: value }, { onSuccess: () => notify({ message: value ? `${quote(v.name)} is now shared with the project` : `${quote(v.name)} is now only yours`, icon: value ? "users" : "lock" }) });
          } else if (action === "delete") {
            svm.remove.mutate({ id }, { onSuccess: () => {
              if (activeSavedId === id) goSaved(null);
              notify({ message: `Deleted the view ${quote(v.name)}`, icon: "trash-2", restore: () => svm.create.mutateAsync({ id: v.id, name: v.name, shared: v.shared, definition: v.definition, quiet: true }) });
            } });
          }
        }}
      />
    ) : null;
  // Views · Filter by · Sort by, stacked under the toolbar; in List view they match the list column.
  const viewRows = projectId ? (
    <div className="td-app-rows" data-view={view}>
      <div className="td-app-rows-inner">
        {savedViewsRow}
        <FilterBar
          open={openMenu === "filter"}
          available={barAvailable}
          filters={filters}
          onToggle={toggleFilter}
          onClear={() => {
            clearFilters();
            closeMenu("filter");
            suggest("clear-filters");
          }}
        />
        <SortBar
          open={openMenu === "sort"}
          dims={SORT_DIMS}
          options={SORT_OPTS}
          sort={sort}
          onSelect={selectSort}
          onReset={() => {
            resetSort();
            closeMenu("sort");
          }}
        />
      </div>
    </div>
  ) : null;

  useAppShortcuts({
    projectId,
    modalOpen: helpOpen || paletteOpen,
    openPalette: () => setPaletteOpen(true),
    openHelp: () => setHelpOpen(true),
    clearFilters,
    openFilter: projectId ? () => setOpenMenu("filter") : undefined,
    addList: projectId && project.data ? () => createList.mutate({ id: newId(), name: `List ${project.data!.lists.length + 1}` }) : undefined,
  });

  const pd = project.data;
  const membersMenu = pd ? (
    <MembersMenu
      members={pd.members.map((x) => ({ id: x.userId, name: x.name, email: x.email, role: x.role, color: avatarColorVar(x.avatarColor) }))}
      currentUserId={user?.id}
      canManage={myRole === "owner" || myRole === "admin"}
      visibility={pd.visibility}
      onVisibilityChange={(v) => pm.updateProject.mutate({ id: pd.id, visibility: v })}
      onChangeRole={(mem, r) => pm.setMember.mutate({ projectId: pd.id, userId: mem.id, role: r })}
      onInvite={() => lifecycle.openSettings(pd.id, "members")}
      url={projectUrl(pd.id)}
    />
  ) : undefined;
  const nav = projectId ? <SubNavbar activeView={view} onViewChange={setView} savedViewsToggle savedViewsOpen={savedViewsOpen} onSavedViewsToggle={setSavedViewsOpen} savedViewsId={savedViewsId} openMenu={openMenu} onOpenMenuChange={setOpenMenu} onAction={(id) => id === "filter" && suggest("filter")} filterMenu={<FilterMenu sections={FILTER_SECTIONS} available={available} filters={filters} counts={counts} onToggle={toggleFilter} onClear={clearFilters} />} sortMenu={<SortMenu sections={[["Sort lists", "lists"], ["Sort items", "items"]]} options={SORT_OPTS} sort={sort} onSelect={selectSort} onReset={resetSort} />} filterActive={filters.length > 0} sortActive={sortActive.length > 0} onExport={exportView} exportCount={topItems.filter((it) => matchesFilters(it, filters, filterCtx)).length} exportFiltered={filters.length > 0} visibility={project.data ? ((project.data.visibility.charAt(0).toUpperCase() + project.data.visibility.slice(1)) as "Private" | "Shared" | "Public") : "Private"} onOpenAppearance={() => navigate({ to: "/settings", search: { s: "appearance" } })} membersMenu={membersMenu} /> : null;

  const openProject = (id: string) => void navigate({ to: "/p/$projectId", params: { projectId: id }, search: {} });
  const sidebarGroups = (groups.data ?? []).map((g) => ({ id: g.id, name: g.name, projects: g.projects.map((p) => ({ id: p.id, name: p.name, icon: (p.icon ?? "kanban") as "kanban", color: p.color ? `var(--label-${p.color})` : undefined })) }));
  const navItems = DEFAULT_NAV.map((n) => (n.id === "inbox" ? { ...n, unread: inboxBadge ? (unread.data?.unread ?? 0) : 0 } : n));
  const prefix = project.data?.keyPrefix ?? "";
  const hitSource = (h: SearchHit) => ({ id: h.id, projectId: h.projectId, title: h.title, itemId: hitKey(h), listName: hitContext(h, projectId), done: h.done });
  // Before a query the palette lists this project's items; a query searches everything the viewer can open.
  const paletteItems = paletteQuery.trim()
    ? paletteHits.hits.map(hitSource)
    : (projectItems.data ?? []).filter((it) => !it.parentItemId).map((it) => ({ id: it.id, projectId: it.projectId, title: it.title, itemId: keyOf(it, prefix), listName: project.data?.lists.find((l) => l.id === it.listId)?.name, done: it.done }));
  const searchSources = {
    groups: (groups.data ?? []).map((g) => ({ id: g.id, name: g.name, projects: g.projects })),
    projects: projectsOf(groups.data).map((p) => ({ id: p.id, name: p.name, icon: (p.icon ?? "kanban") as "kanban", color: p.color ? `var(--label-${p.color})` : undefined, groupName: p.groupName })),
    items: navHits.hits.filter((h) => h.projectId).map(hitSource),
    inbox: navSearch.query.trim() ? navHits.hits.filter((h) => !h.projectId).map(hitSource) : (inboxPreview.data ?? []).filter((it) => !it.parentItemId).map((it) => ({ id: it.id, projectId: null, title: it.title, done: it.done })),
  };

  return (
    <ToastPortalProvider toast={toast ? <Toast key={toast.key} message={toast.message} icon={toast.icon} meta={toast.meta} actionLabel={toast.undo ? (toast.actionLabel ?? "Undo") : undefined} shortcutHint={toast.undo && !toast.standalone ? `${SHORTCUTS.modLabel} Z` : undefined} onAction={toast.undo} onDismiss={dismiss} /> : null}>
    <div className="td-app" data-sidebar-side={ap.sidebarLeft ? "left" : "right"}>
      <TopNavbar
        title={title}
        status={<ConnectionStatus online={save.online} pending={save.waiting} syncing={save.online && save.slowSaving} lastSynced={save.lastSaved} failed={save.failed} transientPending={save.transientWaiting} storageError={save.storageError} onClearFailed={() => navigate({ to: "/settings", search: { s: "storage" } })} onSyncNow={save.retry} onOpenSettings={() => navigate({ to: "/settings", search: { s: "storage" } })} />}
        search
        searchSources={searchSources}
        searchStatus={navHits.status}
        onSearchChange={(query, open) => setNavSearch((s) => (s.query === query && s.open === open ? s : { query, open }))}
        onSearchSelect={(type, id, entity) => {
          if (type === "group") openResult.groups();
          else if (type === "project") openResult.project(id);
          else openResult.item({ id, projectId: type === "inbox" ? null : ((entity as { projectId?: string | null }).projectId ?? null) });
          if (!vp.desktop) setSidebarOpen(false);
        }}
        user={user ? { name: user.name, nickname: user.nickname ?? undefined, email: user.email, src: user.image ?? undefined, avatarColor: avatarColorVar(user.avatarColor) } : { name: "Guest" }}
        signedIn={signedIn}
        onLogout={logout}
        onLogin={() => navigate({ to: "/login", search: { next: location.href } })}
        onCreateAccount={() => navigate({ to: "/signup", search: { next: location.href } })}
        onOpenSettings={() => navigate({ to: "/settings", search: {} })}
        onOpenAccount={() => navigate({ to: "/account", search: {} })}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={setSidebarOpen}
        onCreate={(kind) => {
          if (kind === "item") capture();
          else if (kind === "project") lifecycle.openNewProject(project.data?.groupId);
          else if (kind === "group") lifecycle.openNewGroup();
          else if (kind === "list" && projectId && project.data) createList.mutate({ id: newId(), name: `List ${project.data.lists.length + 1}` });
        }}
      >
        {vp.desktop ? nav : null}
      </TopNavbar>
      {!vp.desktop && nav ? <div className="td-app-subrow">{nav}</div> : null}
      {guestReason && signedIn ? <GuestBar reason={guestReason} projectName={project.data?.name} signedIn /> : null}
      <div className="td-app-body">
        <main className="td-app-content" data-readonly={readonly ? "true" : undefined}>
          {viewRows}
          {/* Dates render in the person's format: a change re-renders the screen (Settings, where it is made, stays put) */}
          <Outlet key={section === "settings" ? section : conventions} />
        </main>
        <Sidebar
          groups={sidebarGroups}
          navItems={navItems}
          activeId={activeId}
          collapsed={!sidebarOpen}
          modal={!vp.desktop}
          onClose={() => setOverlaySidebar(false)}
          onAdd={(groupId) => lifecycle.openNewProject(groupId)}
          onNavAdd={(id) => {
            if (id === "projects") lifecycle.openNewProject(project.data?.groupId);
            else if (id === "groups") lifecycle.openNewGroup();
            else if (id === "inbox") capture();
          }}
          onItemDrop={section === "inbox" ? (target, itemId) => void inbox.fileTo(itemId, target) : undefined}
          onProjectRename={(id, name) => pm.updateProject.mutate({ id, name })}
          onProjectIconChange={(id, icon) => pm.updateProject.mutate({ id, icon })}
          onProjectAction={(id, action) => {
            const p = sidebarGroups.flatMap((g) => g.projects).find((x) => x.id === id);
            if (action === "settings") lifecycle.openSettings(id);
            else if (action === "duplicate") {
              const src = (groups.data ?? []).flatMap((g) => g.projects).find((x) => x.id === id);
              if (src) pm.createProject.mutate({ id: newId(), groupId: src.groupId, name: `${src.name} (copy)`, copyFrom: src.id }, { onSuccess: () => notify({ message: `Duplicated “${src.name}” — lists and settings, not the items`, icon: "copy" }) });
            } else if (action === "archive" || action === "delete") {
              removeProject({ id, name: p?.name ?? "the project" }, action, () => projectId === id && void navigate({ to: "/projects" }));
            }
          }}
          onSelect={(id) => {
            if (id === "inbox" || id === "projects" || id === "groups") void navigate({ to: `/${id}` });
            else openProject(id);
            if (!vp.desktop) setSidebarOpen(false);
          }}
        />
      </div>
      <ShortcutHint hint={hints.hint} />
      <LifecycleDialogs />
      <ShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      <CommandPalette
        open={paletteOpen}
        items={paletteItems}
        status={paletteHits.status}
        emptyHint="Type to find any item in your projects or Inbox"
        onQueryChange={setPaletteQuery}
        onClose={() => {
          setPaletteOpen(false);
          setPaletteQuery("");
        }}
        onSelect={(id, it) => openResult.item({ id, projectId: it.projectId ?? null })}
      />
    </div>
    </ToastPortalProvider>
  );
}

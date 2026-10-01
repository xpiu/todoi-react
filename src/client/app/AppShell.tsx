// AppShell — the frame around every app screen: TopNavbar (with the project's SubNavbar hoisted in
// on desktop), Sidebar, the content, the one Toast, the ? dialog and the Ctrl+K palette. The URL is
// the single source of truth for the current project and view. Spec: DESIGN.md › Responsive.
import { Outlet, useLocation, useMatch, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { newId, useCreateList } from "../data/mutations";
import { useGroups, useInboxUnread, useLabels, useProject, useProjectItems } from "../data/queries";
import { useAppearance } from "../design/core/appearance";
import { SHORTCUTS } from "../design/core/shortcuts";
import { Toast } from "../design/core/Toast";
import { useViewport } from "../design/core/viewport";
import { FilterBar } from "../design/navigation/FilterBar";
import { FilterMenu } from "../design/navigation/FilterMenu";
import { DEFAULT_NAV, Sidebar } from "../design/navigation/Sidebar";
import { SortMenu } from "../design/navigation/SortMenu";
import { SubNavbar } from "../design/navigation/SubNavbar";
import { TopNavbar } from "../design/navigation/TopNavbar";
import { decodeViewState, encodeViewState } from "../design/navigation/viewState";
import { CommandPalette } from "../design/overlay/CommandPalette";
import { ShortcutsDialog } from "../design/overlay/ShortcutsDialog";
import { useFeedback } from "./feedback";
import { availableFilters, describeSort, FILTER_SECTIONS, filterKey, matchesFilters, nextSort, sameFilter, SORT_OPTS, type SortDim } from "./filters";
import { keyOf } from "./items";
import { CURRENT_USER, SEED_PEOPLE } from "./session";
import { useAppShortcuts } from "./useAppShortcuts";
import "./AppShell.css";

const SIDEBAR_KEY = "td-sidebar-open";
const readSidebar = () => {
  try {
    return localStorage.getItem(SIDEBAR_KEY) !== "0";
  } catch {
    return true;
  }
};

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
  const toast = useFeedback((s) => s.toast);
  const dismiss = useFeedback((s) => s.dismiss);
  const setUndoScope = useFeedback((s) => s.setScope);
  const [desktopSidebar, setDesktopSidebar] = useState(readSidebar);
  const [overlaySidebar, setOverlaySidebar] = useState(false);
  const sidebarOpen = vp.desktop ? desktopSidebar : overlaySidebar;
  const setSidebarOpen = vp.desktop ? setDesktopSidebar : setOverlaySidebar;
  const [helpOpen, setHelpOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, desktopSidebar ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [desktopSidebar]);
  // The undo history is per project / screen.
  const undoScope = projectId ?? location.pathname;
  useEffect(() => setUndoScope(undoScope), [undoScope, setUndoScope]);

  const section = location.pathname.split("/")[1] ?? "";
  const activeId = projectId ?? (section === "inbox" || section === "projects" || section === "groups" ? section : undefined);
  const title = projectId ? (project.data?.name ?? "") : section === "inbox" ? "Inbox" : section === "projects" ? "Projects" : section === "groups" ? "Project groups" : section === "settings" ? "Settings" : section === "account" ? "Account" : "Todoi";

  const state = projectMatch ? decodeViewState(projectMatch.search) : null;
  const view = state?.view ?? project.data?.defaultView ?? "list";
  const setView = (v: string) => {
    if (!projectId || !state) return;
    void navigate({ to: "/p/$projectId", params: { projectId }, search: encodeViewState({ ...state, view: v as typeof view, savedView: undefined }) });
  };
  const setViewState = (patch: Partial<typeof state & object>) => {
    if (!projectId || !state) return;
    void navigate({ to: "/p/$projectId", params: { projectId }, search: encodeViewState({ ...state, ...patch, savedView: undefined }) });
  };
  const clearFilters = () => setViewState({ filters: [] });
  const toggleFilter = (f: { type: string; value: string }) => setViewState({ filters: state!.filters.some((a) => sameFilter(a, f)) ? state!.filters.filter((a) => !sameFilter(a, f)) : [...state!.filters, { type: f.type, value: f.value }] });
  const selectSort = (dim: string, key: string) => setViewState({ sort: nextSort(state!.sort, dim as SortDim, key) });

  // Filter options and their match counts over the project's top-level items.
  const topItems = (projectItems.data ?? []).filter((it) => !it.parentItemId);
  const filterCtx = { labels: projectLabels.data ?? [], people: SEED_PEOPLE };
  const available = availableFilters(filterCtx.labels, filterCtx.people);
  const counts = Object.fromEntries(available.map((f) => [filterKey(f), topItems.filter((it) => matchesFilters(it, [f], filterCtx)).length]));
  const filters = state?.filters ?? [];
  const sort = state?.sort ?? { lists: null, items: null };
  const sortActive = (["lists", "items"] as const).filter((d) => sort[d]);
  const barChips = [...available.filter((f) => f.type === "label" || f.type === "due"), ...filters.filter((f) => f.type !== "label" && f.type !== "due").map((f) => available.find((a) => sameFilter(a, f)) ?? f)].map((f) => ({ ...f, selected: filters.some((a) => sameFilter(a, f)) }));
  const hiddenCount = filters.length ? topItems.length - topItems.filter((it) => matchesFilters(it, filters, filterCtx)).length : 0;
  const filterBar =
    projectId && (filters.length || sortActive.length) ? (
      <FilterBar chips={barChips} sorts={sortActive.map((d) => ({ dim: d, label: describeSort(d, sort[d]!) }))} onToggle={toggleFilter} onClearFilters={clearFilters} onClearSort={(d) => selectSort(d, "none")} hidden={hiddenCount} />
    ) : null;

  useAppShortcuts({
    projectId,
    modalOpen: helpOpen || paletteOpen,
    openPalette: () => setPaletteOpen(true),
    openHelp: () => setHelpOpen(true),
    clearFilters,
    addList: projectId && project.data ? () => createList.mutate({ id: newId(), name: `List ${project.data!.lists.length + 1}` }) : undefined,
  });

  const nav = projectId ? <SubNavbar activeView={view} onViewChange={setView} filterMenu={<FilterMenu sections={FILTER_SECTIONS} available={available} filters={filters} counts={counts} onToggle={toggleFilter} onClear={clearFilters} />} sortMenu={<SortMenu sections={[["Sort lists", "lists"], ["Sort items", "items"]]} options={SORT_OPTS} sort={sort} onSelect={selectSort} onReset={() => setViewState({ sort: { lists: null, items: null } })} />} filterCount={filters.length} sortCount={sortActive.length} visibility={project.data ? ((project.data.visibility.charAt(0).toUpperCase() + project.data.visibility.slice(1)) as "Private" | "Shared" | "Public") : "Private"} onOpenAppearance={() => navigate({ to: "/settings" })} /> : null;

  const openProject = (id: string) => void navigate({ to: "/p/$projectId", params: { projectId: id }, search: {} });
  const sidebarGroups = (groups.data ?? []).map((g) => ({ id: g.id, name: g.name, projects: g.projects.map((p) => ({ id: p.id, name: p.name, icon: (p.icon ?? "kanban") as "kanban", color: p.color ? `var(--label-${p.color})` : undefined })) }));
  const navItems = DEFAULT_NAV.map((n) => (n.id === "inbox" ? { ...n, unread: unread.data?.unread ?? 0 } : n));
  const prefix = project.data?.keyPrefix ?? "";
  const paletteItems = (projectItems.data ?? []).filter((it) => !it.parentItemId).map((it) => ({ id: it.id, title: it.title, itemId: keyOf(it, prefix), listName: project.data?.lists.find((l) => l.id === it.listId)?.name, done: it.done }));

  return (
    <div className="td-app" data-sidebar-side={ap.sidebarLeft ? "left" : "right"}>
      <TopNavbar
        title={title}
        search
        user={CURRENT_USER}
        onOpenSettings={() => navigate({ to: "/settings" })}
        onOpenAccount={() => navigate({ to: "/account" })}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={setSidebarOpen}
        onCreate={(kind) => {
          if (kind === "item") void navigate({ to: "/inbox" });
        }}
      >
        {vp.desktop ? nav : null}
      </TopNavbar>
      {!vp.desktop && nav ? <div className="td-app-subrow">{nav}</div> : null}
      {filterBar}
      <div className="td-app-body">
        <main className="td-app-content">
          <Outlet />
        </main>
        {!vp.desktop && sidebarOpen ? <div className="td-sidebar-scrim" onClick={() => setSidebarOpen(false)} /> : null}
        <Sidebar
          groups={sidebarGroups}
          navItems={navItems}
          activeId={activeId}
          collapsed={!sidebarOpen}
          onSelect={(id) => {
            if (id === "inbox" || id === "projects" || id === "groups") void navigate({ to: `/${id}` });
            else openProject(id);
            if (!vp.desktop) setSidebarOpen(false);
          }}
        />
      </div>
      {toast ? <Toast key={toast.key} message={toast.message} icon={toast.icon} meta={toast.meta} actionLabel={toast.undo ? (toast.actionLabel ?? "Undo") : undefined} shortcutHint={toast.undo ? `${SHORTCUTS.modLabel} Z` : undefined} onAction={toast.undo} onDismiss={dismiss} /> : null}
      <ShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
      <CommandPalette
        open={paletteOpen}
        items={paletteItems}
        onClose={() => setPaletteOpen(false)}
        onSelect={(id) => {
          const el = document.querySelector<HTMLElement>(`[data-drag-id="${CSS.escape(id)}"]`);
          el?.scrollIntoView({ block: "center" });
          el?.focus();
        }}
      />
    </div>
  );
}

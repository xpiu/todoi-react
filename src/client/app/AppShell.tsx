// AppShell — the frame around every app screen: TopNavbar (with the project's SubNavbar hoisted in
// on desktop), Sidebar, the content, the one Toast, the ? dialog and the Ctrl+K palette. The URL is
// the single source of truth for the current project and view. Spec: DESIGN.md › Responsive.
import { Outlet, useLocation, useMatch, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { newId, useCreateList } from "../data/mutations";
import { useGroups, useInboxUnread, useLabels, useProject, useProjectItems } from "../data/queries";
import { useAppearance } from "../design/core/appearance";
import { SHORTCUTS } from "../design/core/shortcuts";
import { ShortcutHint, useShortcutHints } from "../design/core/ShortcutHint";
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
import { downloadText, fileSlug, itemsToCsv, viewToMarkdown } from "./exportData";
import { availableFilters, describeSort, FILTER_SECTIONS, filterKey, matchesFilters, nextSort, sameFilter, SORT_OPTS, type SortDim } from "./filters";
import { keyOf } from "./items";
import { useLifecycle } from "./lifecycle";
import { LifecycleDialogs } from "./LifecycleDialogs";
import { useProjectMutations } from "../data/projects";
import { avatarColorVar, peopleOf, useCurrentUser } from "./session";
import { authClient } from "../auth";
import { GuestBar } from "../design/auth/GuestBar";
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
  const lifecycle = useLifecycle();
  const { user } = useCurrentUser();
  const myRole = user ? project.data?.members.find((m) => m.userId === user.id)?.role : undefined;
  // Guests: anonymous on a public project, or a Viewer inside one → read only.
  const readonly = !!projectId && !!project.data && (!user || myRole === "viewer" || (!myRole && project.data.visibility === "public"));
  const guestReason: "public" | "viewer" | null = !readonly ? null : myRole === "viewer" ? "viewer" : "public";
  const logout = () => void authClient.signOut().then(() => navigate({ to: "/login" }));
  const pm = useProjectMutations();
  const toast = useFeedback((s) => s.toast);
  const dismiss = useFeedback((s) => s.dismiss);
  const setUndoScope = useFeedback((s) => s.setScope);
  const [desktopSidebar, setDesktopSidebar] = useState(readSidebar);
  const [overlaySidebar, setOverlaySidebar] = useState(false);
  const sidebarOpen = vp.desktop ? desktopSidebar : overlaySidebar;
  const setSidebarOpen = vp.desktop ? setDesktopSidebar : setOverlaySidebar;
  const [helpOpen, setHelpOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // "Suggest shortcuts": nudges after pointer actions a key could have done.
  const hints = useShortcutHints(ap.suggestShortcuts);
  const suggest = hints.suggest;
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t?.closest) return;
      if (t.closest("[data-add-item]")) suggest("add-item");
      else if (t.closest(".td-listview-addlist, .td-board-addlist")) suggest("add-list");
      else if (t.closest(".td-fbar-clear")) suggest("clear-filters");
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
    suggest(`view-${v}`);
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
  const filterCtx = { labels: projectLabels.data ?? [], people: peopleOf(project.data) };
  const available = availableFilters(filterCtx.labels, filterCtx.people);
  const counts = Object.fromEntries(available.map((f) => [filterKey(f), topItems.filter((it) => matchesFilters(it, [f], filterCtx)).length]));
  const filters = state?.filters ?? [];
  const sort = state?.sort ?? { lists: null, items: null };
  const sortActive = (["lists", "items"] as const).filter((d) => sort[d]);
  const barChips = [...available.filter((f) => f.type === "label" || f.type === "due"), ...filters.filter((f) => f.type !== "label" && f.type !== "due").map((f) => available.find((a) => sameFilter(a, f)) ?? f)].map((f) => ({ ...f, selected: filters.some((a) => sameFilter(a, f)) }));
  const hiddenCount = filters.length ? topItems.length - topItems.filter((it) => matchesFilters(it, filters, filterCtx)).length : 0;
  const notify = useFeedback((s) => s.notify);
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
    notify({ message: `Exported “${p.name}” ${view} view as ${format.toUpperCase()} — ${visible.length} item${visible.length === 1 ? "" : "s"}`, icon: "download" });
  };
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

  const nav = projectId ? <SubNavbar activeView={view} onViewChange={setView} onAction={(id) => id === "filter" && suggest("filter")} filterMenu={<FilterMenu sections={FILTER_SECTIONS} available={available} filters={filters} counts={counts} onToggle={toggleFilter} onClear={clearFilters} />} sortMenu={<SortMenu sections={[["Sort lists", "lists"], ["Sort items", "items"]]} options={SORT_OPTS} sort={sort} onSelect={selectSort} onReset={() => setViewState({ sort: { lists: null, items: null } })} />} filterCount={filters.length} sortCount={sortActive.length} onExport={exportView} exportCount={topItems.filter((it) => matchesFilters(it, filters, filterCtx)).length} exportFiltered={filters.length > 0} visibility={project.data ? ((project.data.visibility.charAt(0).toUpperCase() + project.data.visibility.slice(1)) as "Private" | "Shared" | "Public") : "Private"} onOpenAppearance={() => navigate({ to: "/settings" })} onMembers={() => lifecycle.openSettings(projectId, "members")} /> : null;

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
        user={user ? { name: user.name, nickname: user.nickname ?? undefined, email: user.email, src: user.image ?? undefined, avatarColor: avatarColorVar(user.avatarColor) } : { name: "Guest" }}
        signedIn={!!user}
        onLogout={logout}
        onLogin={() => navigate({ to: "/login" })}
        onOpenSettings={() => navigate({ to: "/settings" })}
        onOpenAccount={() => navigate({ to: "/account" })}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={setSidebarOpen}
        onCreate={(kind) => {
          if (kind === "item") void navigate({ to: "/inbox" });
          else if (kind === "project") lifecycle.openNewProject(project.data?.groupId);
          else if (kind === "group") lifecycle.openNewGroup();
          else if (kind === "list" && projectId && project.data) createList.mutate({ id: newId(), name: `List ${project.data.lists.length + 1}` });
        }}
      >
        {vp.desktop ? nav : null}
      </TopNavbar>
      {!vp.desktop && nav ? <div className="td-app-subrow">{nav}</div> : null}
      {filterBar}
      {guestReason ? <GuestBar reason={guestReason} projectName={project.data?.name} signedIn={!!user} onLogin={() => navigate({ to: "/login" })} onCreateAccount={!user ? () => navigate({ to: "/signup" }) : undefined} /> : null}
      <div className="td-app-body">
        <main className="td-app-content" data-readonly={readonly ? "true" : undefined}>
          <Outlet />
        </main>
        {!vp.desktop && sidebarOpen ? <div className="td-sidebar-scrim" onClick={() => setSidebarOpen(false)} /> : null}
        <Sidebar
          groups={sidebarGroups}
          navItems={navItems}
          activeId={activeId}
          collapsed={!sidebarOpen}
          onAdd={(groupId) => lifecycle.openNewProject(groupId)}
          onNavAdd={(id) => {
            if (id === "projects") lifecycle.openNewProject(project.data?.groupId);
            else if (id === "groups") lifecycle.openNewGroup();
            else if (id === "inbox") void navigate({ to: "/inbox" });
          }}
          onProjectRename={(id, name) => pm.updateProject.mutate({ id, name })}
          onProjectIconChange={(id, icon) => pm.updateProject.mutate({ id, icon })}
          onProjectAction={(id, action) => {
            const p = sidebarGroups.flatMap((g) => g.projects).find((x) => x.id === id);
            if (action === "settings") lifecycle.openSettings(id);
            else if (action === "duplicate") {
              const src = (groups.data ?? []).flatMap((g) => g.projects).find((x) => x.id === id);
              if (src) pm.createProject.mutate({ id: newId(), groupId: src.groupId, name: `${src.name} (copy)`, copyFrom: src.id }, { onSuccess: () => notify({ message: `Duplicated “${src.name}” — lists and settings, not the items`, icon: "copy" }) });
            } else if (action === "archive") {
              pm.archiveProject.mutate({ id });
              notify({ message: `Archived “${p?.name ?? "the project"}”`, icon: "archive", restore: () => pm.restoreProject.mutate({ id }) });
              if (projectId === id) void navigate({ to: "/projects" });
            } else if (action === "delete") {
              pm.deleteProject.mutate({ id });
              notify({ message: `Deleted “${p?.name ?? "the project"}”`, icon: "trash-2", restore: () => pm.restoreProject.mutate({ id }) });
              if (projectId === id) void navigate({ to: "/projects" });
            }
          }}
          onSelect={(id) => {
            if (id === "inbox" || id === "projects" || id === "groups") void navigate({ to: `/${id}` });
            else openProject(id);
            if (!vp.desktop) setSidebarOpen(false);
          }}
        />
      </div>
      {toast ? <Toast key={toast.key} message={toast.message} icon={toast.icon} meta={toast.meta} actionLabel={toast.undo ? (toast.actionLabel ?? "Undo") : undefined} shortcutHint={toast.undo ? `${SHORTCUTS.modLabel} Z` : undefined} onAction={toast.undo} onDismiss={dismiss} /> : null}
      <ShortcutHint hint={hints.hint} />
      <LifecycleDialogs />
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

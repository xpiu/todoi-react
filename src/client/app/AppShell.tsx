// AppShell — the frame around every app screen: TopNavbar (with the project's SubNavbar hoisted in
// on desktop), Sidebar (groups → projects, Projects / Project groups / Inbox), and the content.
// The URL is the single source of truth for the current project and view. Spec: DESIGN.md › Responsive.
import { Outlet, useLocation, useMatch, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { useGroups, useInboxUnread, useProject } from "../data/queries";
import { useAppearance } from "../design/core/appearance";
import { useViewport } from "../design/core/viewport";
import { DEFAULT_NAV, Sidebar } from "../design/navigation/Sidebar";
import { SubNavbar } from "../design/navigation/SubNavbar";
import { TopNavbar } from "../design/navigation/TopNavbar";
import { decodeViewState, encodeViewState } from "../design/navigation/viewState";
import { CURRENT_USER } from "./session";
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
  const [sidebarOpen, setSidebarOpen] = useState(readSidebar);
  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, sidebarOpen ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [sidebarOpen]);

  const section = location.pathname.split("/")[1] ?? "";
  const activeId = projectId ?? (section === "inbox" || section === "projects" || section === "groups" ? section : undefined);
  const title = projectId ? (project.data?.name ?? "") : section === "inbox" ? "Inbox" : section === "projects" ? "Projects" : section === "groups" ? "Project groups" : section === "settings" ? "Settings" : section === "account" ? "Account" : "Todoi";

  const state = projectMatch ? decodeViewState(projectMatch.search) : null;
  const view = state?.view ?? project.data?.defaultView ?? "list";
  const setView = (v: string) => {
    if (!projectId || !state) return;
    void navigate({ to: "/p/$projectId", params: { projectId }, search: encodeViewState({ ...state, view: v as typeof view, savedView: undefined }) });
  };

  const nav = projectId ? <SubNavbar activeView={view} onViewChange={setView} visibility={project.data ? ((project.data.visibility.charAt(0).toUpperCase() + project.data.visibility.slice(1)) as "Private" | "Shared" | "Public") : "Private"} onOpenAppearance={() => navigate({ to: "/settings" })} /> : null;

  const openProject = (id: string) => void navigate({ to: "/p/$projectId", params: { projectId: id }, search: {} });
  const sidebarGroups = (groups.data ?? []).map((g) => ({ id: g.id, name: g.name, projects: g.projects.map((p) => ({ id: p.id, name: p.name, icon: (p.icon ?? "kanban") as "kanban", color: p.color ? `var(--label-${p.color})` : undefined })) }));
  const navItems = DEFAULT_NAV.map((n) => (n.id === "inbox" ? { ...n, unread: unread.data?.unread ?? 0 } : n));

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
    </div>
  );
}

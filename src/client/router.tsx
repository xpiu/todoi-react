// Routes (DESIGN.md › Secondary pages, Saved views): projects live at /p/:id with the view state in
// the query (`v`, `f`, `s`, or `view` for a saved view); /inbox, /projects, /groups, /settings,
// /account, /i/:code; /dev/ds is the primitives gallery outside the app frame.
import { createRootRoute, createRoute, createRouter, Outlet, redirect } from "@tanstack/react-router";
import { lazy } from "react";
import { z } from "zod";

import { PROJECT_VIEWS } from "../shared/enums";
import { AppShell } from "./app/AppShell";
import { InviteScreen, LoginScreen, ResetScreen, SignupScreen } from "./app/auth/AuthScreens";
import { authClient } from "./auth";
import { InboxScreen } from "./app/InboxScreen";
import { ArchiveScreen } from "./app/ArchiveScreen";
import { GroupsScreen } from "./app/GroupsScreen";
import { ProjectsScreen } from "./app/ProjectsScreen";
import { ImportScreen } from "./app/ImportScreen";
import { SettingsScreen } from "./app/SettingsScreen";
import { ProjectScreen } from "./app/ProjectScreen";
import { queryClient } from "./queryClient";
import { groupsQuery } from "./data/queries";

const viewSearchSchema = z.object({
  view: z.string().optional().catch(undefined),
  v: z.enum(PROJECT_VIEWS).optional().catch(undefined),
  f: z.string().optional().catch(undefined),
  s: z.string().optional().catch(undefined),
  /** The open item (overlay) */
  item: z.string().optional().catch(undefined),
  /** Open with the title in edit mode (the E shortcut) */
  edit: z.boolean().optional().catch(undefined),
});
export type ProjectSearch = z.infer<typeof viewSearchSchema>;

export const rootRoute = createRootRoute({ component: Outlet });

/** Everything inside the app frame (top bar + sidebar). */
/** Signed-in only, except project pages: those decide per project (public projects read as a guest). */
export const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  component: AppShell,
  beforeLoad: async ({ location }) => {
    if (/^\/p\//.test(location.pathname)) return;
    const s = await authClient.getSession();
    if (!s.data) throw redirect({ to: "/login", search: { next: location.href } });
  },
});

export const indexRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/",
  // The first project, or the Inbox when there is none.
  beforeLoad: async () => {
    const groups = await queryClient.ensureQueryData(groupsQuery());
    const first = groups.flatMap((g) => g.projects)[0];
    throw redirect(first ? { to: "/p/$projectId", params: { projectId: first.id }, search: {} } : { to: "/inbox" });
  },
});

export const projectRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/p/$projectId",
  validateSearch: (search: Record<string, unknown>) => viewSearchSchema.parse(search),
  component: ProjectScreen,
});

export const inboxRoute = createRoute({ getParentRoute: () => appRoute, path: "/inbox", component: InboxScreen });
export const projectsRoute = createRoute({ getParentRoute: () => appRoute, path: "/projects", component: ProjectsScreen });
export const groupsRoute = createRoute({ getParentRoute: () => appRoute, path: "/groups", component: GroupsScreen });
export const archiveRoute = createRoute({ getParentRoute: () => appRoute, path: "/archive", component: ArchiveScreen, validateSearch: (search: Record<string, unknown>) => z.object({ project: z.string().optional().catch(undefined) }).parse(search) });
const sectionSearch = (s: Record<string, unknown>) => z.object({ s: z.string().optional().catch(undefined) }).parse(s);
export const settingsRoute = createRoute({ getParentRoute: () => appRoute, path: "/settings", component: () => <SettingsScreen page="settings" />, validateSearch: sectionSearch });
export const accountRoute = createRoute({ getParentRoute: () => appRoute, path: "/account", component: () => <SettingsScreen page="account" />, validateSearch: sectionSearch });
export const importRoute = createRoute({ getParentRoute: () => appRoute, path: "/import", component: ImportScreen });
const authSearch = z.object({ next: z.string().optional().catch(undefined), email: z.string().optional().catch(undefined), invite: z.string().optional().catch(undefined) });
export const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: "/login", component: LoginScreen, validateSearch: (s: Record<string, unknown>) => authSearch.parse(s) });
export const signupRoute = createRoute({ getParentRoute: () => rootRoute, path: "/signup", component: SignupScreen, validateSearch: (s: Record<string, unknown>) => authSearch.parse(s) });
export const resetRoute = createRoute({ getParentRoute: () => rootRoute, path: "/reset", component: ResetScreen, validateSearch: (s: Record<string, unknown>) => authSearch.parse(s) });
export const inviteRoute = createRoute({ getParentRoute: () => rootRoute, path: "/i/$code", component: InviteScreen });

const DesignGallery = lazy(() => import("./dev/DesignGallery").then((m) => ({ default: m.DesignGallery })));
export const galleryRoute = createRoute({ getParentRoute: () => rootRoute, path: "/dev/ds", component: DesignGallery });

const routeTree = rootRoute.addChildren([appRoute.addChildren([indexRoute, projectRoute, inboxRoute, projectsRoute, groupsRoute, archiveRoute, settingsRoute, accountRoute, importRoute]), loginRoute, signupRoute, resetRoute, inviteRoute, galleryRoute]);

export const router = createRouter({ routeTree, defaultPreload: "intent", scrollRestoration: true });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

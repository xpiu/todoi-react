// Routes (DESIGN.md › Secondary pages, Saved views): projects live at /p/:id with the view state in
// the query (`v`, `f`, `s`, or `view` for a saved view); /inbox, /projects, /groups, /settings,
// /account, /i/:code; /dev/ds is the primitives gallery outside the app frame.
import { createRootRoute, createRoute, createRouter, Outlet, redirect } from "@tanstack/react-router";
import { lazy } from "react";
import { z } from "zod";

import { PROJECT_VIEWS } from "../shared/enums";
import { AppShell } from "./app/AppShell";
import { preloadDescriptionEditor } from "./design/overlay/DescriptionEditor";
import { ScreenError, SessionError } from "./app/RouteError";
import { InviteScreen, LoginScreen, ResetScreen, SignupScreen } from "./app/auth/AuthScreens";
import { authClient, ensureBrowserSession } from "./auth";
import { InboxScreen } from "./app/InboxScreen";
import { ArchiveScreen } from "./app/ArchiveScreen";
import { GroupsScreen } from "./app/GroupsScreen";
import { ProjectsScreen } from "./app/ProjectsScreen";
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

export const rootRoute = createRootRoute({ component: Outlet, errorComponent: SessionError });

/** Everything inside the app frame (top bar + sidebar). */
export const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  component: AppShell,
  beforeLoad: ensureBrowserSession,
  // The frame never rendered: no session. Its screens' own failures render inside it (ScreenError).
  errorComponent: SessionError,
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

// `item`: the open Inbox item (overlay; `edit` opens its title for renaming); `capture`: open the quick-add field.
export const inboxRoute = createRoute({ getParentRoute: () => appRoute, path: "/inbox", component: InboxScreen, validateSearch: (search: Record<string, unknown>) => z.object({ item: z.string().optional().catch(undefined), edit: z.boolean().optional().catch(undefined), capture: z.boolean().optional().catch(undefined) }).parse(search) });
export const projectsRoute = createRoute({ getParentRoute: () => appRoute, path: "/projects", component: ProjectsScreen });
export const groupsRoute = createRoute({ getParentRoute: () => appRoute, path: "/groups", component: GroupsScreen });
export const archiveRoute = createRoute({ getParentRoute: () => appRoute, path: "/archive", component: ArchiveScreen, validateSearch: (search: Record<string, unknown>) => z.object({ project: z.string().optional().catch(undefined) }).parse(search) });
// Settings, Account and Import load on demand, like the design gallery.
const loadSettings = () => import("./app/SettingsScreen");
const SettingsScreen = lazy(() => loadSettings().then((m) => ({ default: m.SettingsScreen })));
// Warm Settings and the rich editor once idle, so both still open after the connection drops.
if (typeof window !== "undefined") (window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500)))(() => {
  void loadSettings().catch(() => undefined);
  void preloadDescriptionEditor().catch(() => undefined);
});
const ImportScreen = lazy(() => import("./app/ImportScreen").then((m) => ({ default: m.ImportScreen })));
const sectionSearch = (s: Record<string, unknown>) => z.object({ s: z.string().optional().catch(undefined) }).parse(s);
export const settingsRoute = createRoute({ getParentRoute: () => appRoute, path: "/settings", component: () => <SettingsScreen page="settings" />, validateSearch: sectionSearch });
export const accountRoute = createRoute({ getParentRoute: () => appRoute, path: "/account", component: () => <SettingsScreen page="account" />, validateSearch: sectionSearch, beforeLoad: async () => {
  const session = await authClient.getSession();
  if (!session.data || session.data.user.isAnonymous) throw redirect({ to: "/login", search: { next: "/account" } });
} });
export const importRoute = createRoute({ getParentRoute: () => appRoute, path: "/import", component: ImportScreen });
const authSearch = z.object({ next: z.string().optional().catch(undefined), email: z.string().optional().catch(undefined), invite: z.string().optional().catch(undefined) });
export const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: "/login", component: LoginScreen, validateSearch: (s: Record<string, unknown>) => authSearch.parse(s) });
export const signupRoute = createRoute({ getParentRoute: () => rootRoute, path: "/signup", component: SignupScreen, validateSearch: (s: Record<string, unknown>) => authSearch.parse(s) });
export const resetRoute = createRoute({ getParentRoute: () => rootRoute, path: "/reset", component: ResetScreen, validateSearch: (s: Record<string, unknown>) => authSearch.parse(s) });
export const inviteRoute = createRoute({ getParentRoute: () => rootRoute, path: "/i/$code", component: InviteScreen });

const DesignGallery = lazy(() => import("./dev/DesignGallery").then((m) => ({ default: m.DesignGallery })));
export const galleryRoute = createRoute({ getParentRoute: () => rootRoute, path: "/dev/ds", component: DesignGallery });

const routeTree = rootRoute.addChildren([appRoute.addChildren([indexRoute, projectRoute, inboxRoute, projectsRoute, groupsRoute, archiveRoute, settingsRoute, accountRoute, importRoute]), loginRoute, signupRoute, resetRoute, inviteRoute, galleryRoute]);

export const router = createRouter({ routeTree, defaultPreload: "intent", scrollRestoration: true, defaultErrorComponent: ScreenError });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

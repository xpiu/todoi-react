// Routes (DESIGN.md › Secondary pages, Saved views): a project lives at the root under its slug (/epd5vjxy38,
// shared/projectLinks.ts) with the view state in the query (`v`, `f`, `s`, or `view` for a saved view) and the open
// item by key (`item=MP-102`); /p/:id, the earlier project link, moves on to it; /inbox, /projects, /groups, /search, /settings,
// /account, /import, /docs, /docs/agents, /i/:code; the emailed links' landings /reset, /verify-email and /confirm-email; /account-deleted; /dev/ds is the primitives gallery outside the app frame.
import { createRootRoute, createRoute, createRouter, notFound, Outlet, redirect } from "@tanstack/react-router";
import { lazy } from "react";
import { z } from "zod";

import { GROUP_KEYS, PROJECT_VIEWS } from "../shared/enums";
import { ITEM_STATUSES } from "../shared/item-status";
import { isProjectSlug } from "../shared/projectLinks";
import { AppShell } from "./app/AppShell";
import { preloadDescriptionEditor } from "./design/overlay/DescriptionEditor";
import { ScreenError, SessionError } from "./app/RouteError";
import { AccountDeletedScreen, ConfirmEmailChangeScreen, InviteScreen, LoginScreen, ResetScreen, SignupScreen, VerifyEmailScreen } from "./app/auth/AuthScreens";
import { authClient, ensureBrowserSession, SignInRequired } from "./auth";
import { InboxScreen } from "./app/InboxScreen";
import { ArchiveScreen } from "./app/ArchiveScreen";
import { GroupsScreen } from "./app/GroupsScreen";
import { ProjectsScreen } from "./app/ProjectsScreen";
import { OldProjectLink, ProjectScreen } from "./app/ProjectScreen";
import { slugOf } from "./app/projectNav";
import { SearchScreen } from "./app/SearchScreen";
import { queryClient } from "./queryClient";
import { groupsQuery } from "./data/queries";

const viewSearchSchema = z.object({
  view: z.string().optional().catch(undefined),
  v: z.enum(PROJECT_VIEWS).optional().catch(undefined),
  f: z.string().optional().catch(undefined),
  s: z.string().optional().catch(undefined),
  /** Group by (List view) */
  g: z.enum(GROUP_KEYS).optional().catch(undefined),
  /** The open item (overlay): its key (MP-102), or its id while it has none */
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
  // Invite-only servers make no guest workspaces: a visitor without a session logs in, then comes back here.
  beforeLoad: ({ location }) =>
    ensureBrowserSession().catch((e: unknown) => {
      if (e instanceof SignInRequired) throw redirect({ to: "/login", search: { next: location.href === "/" ? undefined : location.href } });
      throw e;
    }),
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
    if (!first) throw redirect({ to: "/inbox" });
    // A sidebar kept on this device from before slugs has none until it refreshes: the id link finds the project.
    throw redirect(first.slug ? { to: "/$projectSlug", params: { projectSlug: first.slug }, search: {} } : { to: "/p/$projectId", params: { projectId: first.id }, search: {} });
  },
});

// The one dynamic route at the root. A slug always holds a digit and no app route does (isProjectSlug), so
// anything else here is a page that doesn't exist, not a project.
export const projectRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/$projectSlug",
  validateSearch: (search: Record<string, unknown>) => viewSearchSchema.parse(search),
  beforeLoad: ({ params }) => {
    if (!isProjectSlug(params.projectSlug)) throw notFound();
  },
  component: ProjectScreen,
});
// A project link by database id, as the app wrote them before slugs: it moves on to the project's own link.
export const oldProjectRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/p/$projectId",
  validateSearch: (search: Record<string, unknown>) => viewSearchSchema.parse(search),
  beforeLoad: async ({ params, search }) => {
    // The sidebar knows the person's own projects; any other project is found by the page itself (OldProjectLink).
    await queryClient.ensureQueryData(groupsQuery()).catch(() => undefined);
    const slug = slugOf(params.projectId);
    if (slug) throw redirect({ to: "/$projectSlug", params: { projectSlug: slug }, search, replace: true });
  },
  component: OldProjectLink,
});

// `item`: the open Inbox item (overlay; `edit` opens its title for renaming); `capture`: open the quick-add field.
export const inboxRoute = createRoute({ getParentRoute: () => appRoute, path: "/inbox", component: InboxScreen, validateSearch: (search: Record<string, unknown>) => z.object({ item: z.string().optional().catch(undefined), edit: z.boolean().optional().catch(undefined), capture: z.boolean().optional().catch(undefined) }).parse(search) });
export const projectsRoute = createRoute({ getParentRoute: () => appRoute, path: "/projects", component: ProjectsScreen });
export const groupsRoute = createRoute({ getParentRoute: () => appRoute, path: "/groups", component: GroupsScreen });
// The Search page: the query and its filters, and the open item (overlay over the results).
const searchPageSchema = z.object({
  q: z.string().max(200).optional().catch(undefined),
  project: z.string().optional().catch(undefined),
  status: z.enum(ITEM_STATUSES).optional().catch(undefined),
  /** A user id, or "__none" for unassigned */
  assignee: z.string().optional().catch(undefined),
  archived: z.boolean().optional().catch(undefined),
  item: z.string().optional().catch(undefined),
  edit: z.boolean().optional().catch(undefined),
});
export const searchRoute = createRoute({ getParentRoute: () => appRoute, path: "/search", component: SearchScreen, validateSearch: (search: Record<string, unknown>) => searchPageSchema.parse(search) });
export const archiveRoute = createRoute({ getParentRoute: () => appRoute, path: "/archive", component: ArchiveScreen, validateSearch: (search: Record<string, unknown>) => z.object({ project: z.string().optional().catch(undefined) }).parse(search) });
// Settings, Account, Import and Docs load on demand, like the design gallery.
const loadSettings = () => import("./app/SettingsScreen");
const SettingsScreen = lazy(() => loadSettings().then((m) => ({ default: m.SettingsScreen })));
// Warm Settings and the rich editor once idle, so both still open after the connection drops.
if (typeof window !== "undefined") (window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500)))(() => {
  void loadSettings().catch(() => undefined);
  void preloadDescriptionEditor().catch(() => undefined);
});
const ImportScreen = lazy(() => import("./app/ImportScreen").then((m) => ({ default: m.ImportScreen })));
const AdminScreen = lazy(() => import("./app/AdminScreen").then((m) => ({ default: m.AdminScreen })));
const sectionSearch = (s: Record<string, unknown>) => z.object({ s: z.string().optional().catch(undefined) }).parse(s);
export const settingsRoute = createRoute({ getParentRoute: () => appRoute, path: "/settings", component: () => <SettingsScreen page="settings" />, validateSearch: sectionSearch });
export const accountRoute = createRoute({ getParentRoute: () => appRoute, path: "/account", component: () => <SettingsScreen page="account" />, validateSearch: sectionSearch, beforeLoad: async () => {
  const session = await authClient.getSession();
  if (!session.data || session.data.user.isAnonymous) throw redirect({ to: "/login", search: { next: "/account" } });
} });
export const importRoute = createRoute({ getParentRoute: () => appRoute, path: "/import", component: ImportScreen });
export const adminRoute = createRoute({ getParentRoute: () => appRoute, path: "/admin", component: AdminScreen });
const DocsScreen = lazy(() => import("./app/DocsScreen").then((m) => ({ default: m.DocsScreen })));
export const docsRoute = createRoute({ getParentRoute: () => appRoute, path: "/docs", component: () => <DocsScreen page="people" /> });
export const agentDocsRoute = createRoute({ getParentRoute: () => appRoute, path: "/docs/agents", component: () => <DocsScreen page="agents" /> });
const authSearch = z.object({ next: z.string().optional().catch(undefined), email: z.string().optional().catch(undefined), invite: z.string().optional().catch(undefined) });
/** Where an emailed link lands: Better Auth adds `token` on success or `error` (a code such as INVALID_TOKEN) */
const linkSearch = authSearch.extend({ token: z.string().optional().catch(undefined), error: z.string().optional().catch(undefined) });
export const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: "/login", component: LoginScreen, validateSearch: (s: Record<string, unknown>) => authSearch.parse(s) });
export const signupRoute = createRoute({ getParentRoute: () => rootRoute, path: "/signup", component: SignupScreen, validateSearch: (s: Record<string, unknown>) => authSearch.parse(s) });
export const resetRoute = createRoute({ getParentRoute: () => rootRoute, path: "/reset", component: ResetScreen, validateSearch: (s: Record<string, unknown>) => linkSearch.parse(s) });
export const accountDeletedRoute = createRoute({ getParentRoute: () => rootRoute, path: "/account-deleted", component: AccountDeletedScreen, validateSearch: (s: Record<string, unknown>) => authSearch.parse(s) });
export const confirmEmailRoute = createRoute({ getParentRoute: () => rootRoute, path: "/confirm-email", component: ConfirmEmailChangeScreen, validateSearch: (s: Record<string, unknown>) => linkSearch.parse(s) });
export const verifyEmailRoute = createRoute({ getParentRoute: () => rootRoute, path: "/verify-email", component: VerifyEmailScreen, validateSearch: (s: Record<string, unknown>) => linkSearch.parse(s) });
export const inviteRoute = createRoute({ getParentRoute: () => rootRoute, path: "/i/$code", component: InviteScreen });

const DesignGallery = lazy(() => import("./dev/DesignGallery").then((m) => ({ default: m.DesignGallery })));
export const galleryRoute = createRoute({ getParentRoute: () => rootRoute, path: "/dev/ds", component: DesignGallery });

const routeTree = rootRoute.addChildren([appRoute.addChildren([indexRoute, projectRoute, oldProjectRoute, inboxRoute, projectsRoute, groupsRoute, searchRoute, archiveRoute, settingsRoute, accountRoute, importRoute, adminRoute, docsRoute, agentDocsRoute]), loginRoute, signupRoute, resetRoute, verifyEmailRoute, confirmEmailRoute, accountDeletedRoute, inviteRoute, galleryRoute]);

export const router = createRouter({ routeTree, defaultPreload: "intent", scrollRestoration: true, defaultErrorComponent: ScreenError });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
  interface HistoryState {
    /** The settings page (/settings or /account) a visit started on; it stays first in the page nav (SettingsScreen). */
    settingsLead?: "settings" | "account";
  }
}

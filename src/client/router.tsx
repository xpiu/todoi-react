// Routes (DESIGN.md › Secondary pages, Saved views): projects live at /p/:id with the view state in
// the query (`v`, `f`, `s`, or `view` for a saved view); /inbox, /projects, /groups, /settings,
// /account, /i/:code; /dev/ds is the primitives gallery outside the app frame.
import { createRootRoute, createRoute, createRouter, Outlet, redirect } from "@tanstack/react-router";
import { lazy } from "react";
import { z } from "zod";

import { PROJECT_VIEWS } from "../shared/enums";
import { AppShell } from "./app/AppShell";
import { InboxScreen } from "./app/InboxScreen";
import { PlaceholderScreen } from "./app/PlaceholderScreen";
import { ProjectScreen } from "./app/ProjectScreen";
import { queryClient } from "./queryClient";
import { groupsQuery } from "./data/queries";

const viewSearchSchema = z.object({
  view: z.string().optional().catch(undefined),
  v: z.enum(PROJECT_VIEWS).optional().catch(undefined),
  f: z.string().optional().catch(undefined),
  s: z.string().optional().catch(undefined),
});
export type ProjectSearch = z.infer<typeof viewSearchSchema>;

export const rootRoute = createRootRoute({ component: Outlet });

/** Everything inside the app frame (top bar + sidebar). */
export const appRoute = createRoute({ getParentRoute: () => rootRoute, id: "app", component: AppShell });

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
export const projectsRoute = createRoute({ getParentRoute: () => appRoute, path: "/projects", component: () => <PlaceholderScreen title="Projects" hint="The Projects overview (list–status links, counts) lands with the project lifecycle phase." icon="folder" /> });
export const groupsRoute = createRoute({ getParentRoute: () => appRoute, path: "/groups", component: () => <PlaceholderScreen title="Project groups" hint="Groups with item totals and completion land with the project lifecycle phase." icon="folders" /> });
export const settingsRoute = createRoute({ getParentRoute: () => appRoute, path: "/settings", component: () => <PlaceholderScreen title="Settings" hint="The Settings shell (General, Storage & sync, Labels, Appearance, Keyboard…) lands in the settings phase." icon="settings" /> });
export const accountRoute = createRoute({ getParentRoute: () => appRoute, path: "/account", component: () => <PlaceholderScreen title="Account" hint="Profile, sign-in methods, tokens and devices land with authentication." icon="user" /> });
export const inviteRoute = createRoute({ getParentRoute: () => rootRoute, path: "/i/$code", component: () => <PlaceholderScreen title="Invite" hint="Invite landing pages arrive with authentication." icon="mail" /> });

const DesignGallery = lazy(() => import("./dev/DesignGallery").then((m) => ({ default: m.DesignGallery })));
export const galleryRoute = createRoute({ getParentRoute: () => rootRoute, path: "/dev/ds", component: DesignGallery });

const routeTree = rootRoute.addChildren([appRoute.addChildren([indexRoute, projectRoute, inboxRoute, projectsRoute, groupsRoute, settingsRoute, accountRoute]), inviteRoute, galleryRoute]);

export const router = createRouter({ routeTree, defaultPreload: "intent", scrollRestoration: true });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

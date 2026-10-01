import { Hono } from "hono";
import { logger } from "hono/logger";

import { activityRoute, commentsRoute, inboxRoute, itemContentRoute, labelsRoute, savedViewsRoute } from "./routes/content";
import { attachmentsRoute, itemAttachmentsRoute } from "./routes/attachments";
import { invitesRoute, meRoute, projectInvitesRoute } from "./routes/account";
import { itemsRoute } from "./routes/items";
import { auth, authMiddleware } from "./auth";
import { groupsRoute, listsRoute, projectsRoute, archiveRoute, membersRoute } from "./routes/projects";

// Chained so Hono can infer the full route type for the RPC client (`hc<AppType>`).
export const app = new Hono()
  .use(logger())
  .basePath("/api")
  .get("/health", (c) => c.json({ ok: true }))
  // Better Auth owns /api/auth/*; everything after resolves the session first.
  .on(["GET", "POST"], "/auth/*", (c) => auth.handler(c.req.raw))
  .use("*", authMiddleware)
  .route("/me", meRoute)
  .route("/invites", invitesRoute)
  .route("/projects", projectInvitesRoute)
  .route("/groups", groupsRoute)
  .route("/projects", projectsRoute)
  .route("/projects", membersRoute)
  .route("/archive", archiveRoute)
  .route("/lists", listsRoute)
  .route("/items", itemsRoute)
  .route("/items", itemContentRoute)
  .route("/items", itemAttachmentsRoute)
  .route("/attachments", attachmentsRoute)
  .route("/labels", labelsRoute)
  .route("/comments", commentsRoute)
  .route("/saved-views", savedViewsRoute)
  .route("/activity", activityRoute)
  .route("/inbox", inboxRoute);

export type AppType = typeof app;

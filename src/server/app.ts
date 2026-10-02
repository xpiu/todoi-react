import { Hono } from "hono";
import { logger } from "hono/logger";
import { requestId } from "hono/request-id";

import { activityRoute, commentsRoute, inboxRoute, itemContentRoute, labelsRoute, savedViewsRoute } from "./routes/content";
import { attachmentsRoute, itemAttachmentsRoute } from "./routes/attachments";
import { exportRoute, invitesRoute, meRoute, projectInvitesRoute, tokensRoute } from "./routes/account";
import { itemsRoute } from "./routes/items";
import { searchRoute } from "./routes/search";
import { auth, authMiddleware } from "./auth";
import { groupsRoute, listsRoute, projectsRoute, archiveRoute, membersRoute } from "./routes/projects";
import { workspaceAccess } from "./access";
import { notFound, onError } from "./errors";

// Chained so Hono can infer the full route type for the RPC client (`hc<AppType>`).
export const app = new Hono()
  .use(requestId())
  .use(logger())
  .basePath("/api")
  .get("/health", (c) => c.json({ ok: true }))
  // Better Auth owns /api/auth/*; everything after resolves the session first.
  .on(["GET", "POST"], "/auth/*", (c) => auth.handler(c.req.raw))
  .use("*", authMiddleware)
  .use("*", workspaceAccess)
  .route("/me", meRoute)
  .route("/me/tokens", tokensRoute)
  .route("/me/export", exportRoute)
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
  .route("/inbox", inboxRoute)
  .route("/search", searchRoute);

// One error shape for every refusal and failure (src/shared/errors.ts), with the request id the log line carries.
app.onError(onError).notFound(notFound);

export type AppType = typeof app;

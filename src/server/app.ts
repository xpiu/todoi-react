import { Hono } from "hono";
import { logger } from "hono/logger";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";

import { activityRoute, commentsRoute, inboxRoute, itemContentRoute, labelsRoute, savedViewsRoute } from "./routes/content";
import { attachmentsRoute, itemAttachmentsRoute } from "./routes/attachments";
import { avatarsRoute, calendarFeedRoute, exportRoute, feedsRoute, invitesRoute, meRoute, projectInvitesRoute, restoreRoute, tokensRoute } from "./routes/account";
import { deletionRoute, emailChangeRoute, sudoRoute } from "./routes/accountChanges";
import { gitConnectionsRoute, gitSyncRoute, webhooksRoute } from "./routes/gitSync";
import { itemsRoute } from "./routes/items";
import { searchRoute } from "./routes/search";
import { auth, authMiddleware } from "./auth";
import { groupsRoute, listsRoute, projectsRoute, archiveRoute, membersRoute } from "./routes/projects";
import { workspaceMutations } from "./sync";
import { notFound, onError } from "./errors";
import { invalidTokenLimit, LIMITS, rateLimit } from "./rateLimit";

// Throttling (rateLimit.ts, work plan R3). One counter per rule, shared by the paths it covers.
const signInLimit = rateLimit(LIMITS.signIn);
const authEmailLimit = rateLimit(LIMITS.authEmail);

// Chained so Hono can infer the full route type for the RPC client (`hc<AppType>`).
export const app = new Hono()
  .use(requestId())
  .use(logger())
  // Browser hardening on every response, the built client included (index.ts serves it behind these):
  // no MIME sniffing, no framing or embedding by other sites, no referrer, HTTPS only once seen over HTTPS.
  // HSTS covers this host alone, since other subdomains aren't this app's to decide for. There is no
  // Content-Security-Policy yet: index.html applies the stored theme with an inline script.
  .use(secureHeaders({ strictTransportSecurity: "max-age=15552000" }))
  .basePath("/api")
  .get("/health", (c) => c.json({ ok: true }))
  // Every request from one address, then tighter limits where a request logs in, makes an account or sends email.
  .use("*", rateLimit(LIMITS.address))
  .use("/auth/sign-in/email", signInLimit)
  .use("/auth/passkey/verify-authentication", signInLimit)
  .use("/auth/sign-up/email", rateLimit(LIMITS.signUp))
  .use("/auth/sign-in/anonymous", rateLimit(LIMITS.guest))
  .use("/auth/request-password-reset", authEmailLimit)
  .use("/auth/send-verification-email", authEmailLimit)
  // Better Auth owns /api/auth/*; everything after resolves the session first.
  .on(["GET", "POST"], "/auth/*", (c) => auth.handler(c.req.raw))
  // Calendar apps poll the private feed without a session: the link is the secret (no cookie is read or set).
  .route("/feeds", feedsRoute)
  // GitHub calls this without a session: each delivery is verified by its signature (gitSync/webhooks.ts).
  .use("/webhooks/*", rateLimit(LIMITS.webhook))
  .route("/webhooks", webhooksRoute)
  // API tokens: a budget per token, and tokens that don't work count against their address (before the lookup).
  .use("*", rateLimit(LIMITS.token))
  .use("*", invalidTokenLimit())
  .use("*", authMiddleware)
  .use("/me/export/*", rateLimit(LIMITS.export))
  .use("/me/restore", rateLimit(LIMITS.export))
  .use("*", workspaceMutations)
  .route("/me", meRoute)
  .route("/me/sudo", sudoRoute)
  .route("/me/email-change", emailChangeRoute)
  .route("/me/deletion", deletionRoute)
  .route("/avatars", avatarsRoute)
  .route("/me/tokens", tokensRoute)
  .route("/me/export", exportRoute)
  .route("/me/restore", restoreRoute)
  .route("/me/calendar-feed", calendarFeedRoute)
  .route("/invites", invitesRoute)
  .route("/projects", projectInvitesRoute)
  .route("/groups", groupsRoute)
  .route("/projects", projectsRoute)
  .route("/projects", membersRoute)
  .route("/projects", gitSyncRoute)
  .route("/git", gitConnectionsRoute)
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

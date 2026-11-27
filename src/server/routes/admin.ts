// The operator console's API (work plan R8), for confirmed accounts listed in ADMIN_EMAILS: an overview
// (accounts, content, the job queue, Git sync health, grouped errors), the account list, confirming an
// account's address by hand, the outbox of unsent emails, marking an error resolved and retrying a failed job. And /api/errors, where the browser reports what broke there.
import { and, count, desc, eq, ilike, isNull, lt, or, sql } from "drizzle-orm";
import { Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";

import { viewerOf } from "../auth";
import { db } from "../db";
import { errorGroups, gitConnections, items, jobs, members, projects, sessions, users } from "../db/schema";
import { env } from "../env";
import { fail, validate } from "../errors";
import { STALE_AFTER_MS } from "../jobKinds";
import { writtenEmails } from "../email";
import { emailConfirmed } from "../services/confirmedEmail";
import { pagePathGroup, recordError } from "../services/errorTracking";

/** Whether this person may open the operator console: a confirmed address listed in ADMIN_EMAILS. */
export async function isOperator(viewer: { userId: string; email: string; isAnonymous?: boolean } | null | undefined): Promise<boolean> {
  if (!viewer || viewer.isAnonymous || !env.ADMIN_EMAILS.includes(viewer.email.toLowerCase())) return false;
  return emailConfirmed(viewer.userId);
}

const operatorsOnly: MiddlewareHandler = async (c, next) => {
  if (!(await isOperator(viewerOf(c)))) return fail(c, 403, "This page is for todoi's operators");
  await next();
};

const n = (v: unknown) => Number(v ?? 0);

export const adminRoute = new Hono()
  .use("*", operatorsOnly)
  .get("/overview", async (c) => {
    const week = sql`now() - interval '7 days'`;
    const [[acct], [content], jobStates, failedJobs, [overdueJobs], connStates, failing, overdue, errors] = await Promise.all([
      db.select({ total: count(), guests: sql<number>`count(*) filter (where ${users.isAnonymous})`, verified: sql<number>`count(*) filter (where ${users.emailVerified})`, new7d: sql<number>`count(*) filter (where ${users.createdAt} > ${week})`, active7d: sql<number>`(select count(distinct ${sessions.userId}) from ${sessions} where ${sessions.updatedAt} > ${week})` }).from(users),
      db.select({ projects: sql<number>`(select count(*) from ${projects} where ${projects.deletedAt} is null)`, items: sql<number>`(select count(*) from ${items} where ${items.deletedAt} is null)` }).from(sql`(select 1) as one`),
      db.select({ state: jobs.state, n: count() }).from(jobs).groupBy(jobs.state),
      db.select({ id: jobs.id, kind: jobs.kind, attempts: jobs.attempts, lastError: jobs.lastError, finishedAt: jobs.finishedAt }).from(jobs).where(eq(jobs.state, "failed")).orderBy(desc(jobs.finishedAt)).limit(20),
      db.select({ n: count() }).from(jobs).where(and(eq(jobs.state, "queued"), lt(jobs.runAt, sql`now() - interval '5 minutes'`))),
      db.select({ state: gitConnections.state, n: count() }).from(gitConnections).groupBy(gitConnections.state),
      db.select({ projectId: gitConnections.projectId, project: projects.name, owner: gitConnections.owner, repo: gitConnections.repo, lastError: gitConnections.lastError, lastSyncedAt: gitConnections.lastSyncedAt }).from(gitConnections).innerJoin(projects, eq(projects.id, gitConnections.projectId)).where(eq(gitConnections.state, "error")).orderBy(desc(gitConnections.updatedAt)).limit(20),
      db.select({ projectId: gitConnections.projectId, project: projects.name, owner: gitConnections.owner, repo: gitConnections.repo, lastSyncedAt: gitConnections.lastSyncedAt }).from(gitConnections).innerJoin(projects, eq(projects.id, gitConnections.projectId)).where(and(eq(gitConnections.autoSync, true), eq(gitConnections.state, "ok"), lt(gitConnections.lastSyncedAt, new Date(Date.now() - STALE_AFTER_MS)))).limit(20),
      db.select().from(errorGroups).orderBy(sql`${errorGroups.resolvedAt} is not null`, desc(errorGroups.lastSeen)).limit(50),
    ]);
    const states = Object.fromEntries(jobStates.map((j) => [j.state, j.n]));
    const conns = Object.fromEntries(connStates.map((s) => [s.state, s.n]));
    return c.json({
      accounts: { total: n(acct?.total), registered: n(acct?.total) - n(acct?.guests), guests: n(acct?.guests), verified: n(acct?.verified), new7d: n(acct?.new7d), active7d: n(acct?.active7d) },
      content: { projects: n(content?.projects), items: n(content?.items) },
      jobs: { queued: n(states.queued), running: n(states.running), failed: n(states.failed), overdue: n(overdueJobs?.n), recentFailures: failedJobs.map((j) => ({ ...j, finishedAt: j.finishedAt?.toISOString() ?? null })) },
      gitSync: { total: Object.values(conns).reduce((a, b) => a + n(b), 0), ok: n(conns.ok), conflict: n(conns.conflict), error: n(conns.error), failing: failing.map((f) => ({ ...f, lastSyncedAt: f.lastSyncedAt?.toISOString() ?? null })), overdue: overdue.map((f) => ({ ...f, lastSyncedAt: f.lastSyncedAt?.toISOString() ?? null })) },
      errors: errors.map((e) => ({ ...e, firstSeen: e.firstSeen.toISOString(), lastSeen: e.lastSeen.toISOString(), resolvedAt: e.resolvedAt?.toISOString() ?? null })),
    });
  })
  .get("/accounts", validate("query", z.object({ q: z.string().max(200).optional() })), async (c) => {
    const q = c.req.valid("query").q?.trim();
    const rows = await db
      .select({ id: users.id, name: users.name, email: users.email, guest: users.isAnonymous, verified: users.emailVerified, createdAt: users.createdAt, projects: sql<number>`(select count(*) from ${members} where ${members.userId} = ${users.id})`, lastSeen: sql<string | null>`(select max(${sessions.updatedAt}) from ${sessions} where ${sessions.userId} = ${users.id})` })
      .from(users)
      .where(q ? or(ilike(users.email, `%${q}%`), ilike(users.name, `%${q}%`)) : eq(users.isAnonymous, false))
      .orderBy(desc(users.createdAt))
      .limit(50);
    return c.json({ accounts: rows.map((r) => ({ ...r, projects: n(r.projects), createdAt: r.createdAt.toISOString(), lastSeen: r.lastSeen ? new Date(r.lastSeen).toISOString() : null })) });
  })
  .post("/errors/:fingerprint/resolve", validate("param", z.object({ fingerprint: z.string().regex(/^[0-9a-f]{32}$/) })), async (c) => {
    const [row] = await db.update(errorGroups).set({ resolvedAt: new Date() }).where(and(eq(errorGroups.fingerprint, c.req.valid("param").fingerprint), isNull(errorGroups.resolvedAt))).returning({ fingerprint: errorGroups.fingerprint });
    return row ? c.body(null, 204) : fail(c, 404, "That error is already resolved or gone");
  })
  // The outbox: with RESEND_API_KEY unset nothing is sent, so an operator passes a tester their link by hand.
  .get("/emails", async (c) => c.json({ sending: !!env.RESEND_API_KEY, emails: env.RESEND_API_KEY ? [] : await writtenEmails(env.EMAIL_DIR, env.APP_URL) }))
  // While email can't be delivered (no RESEND_API_KEY yet), an operator who knows the person vouches for
  // the address instead of a confirmation link: what R4 waits for (inviting, joining by address) unlocks.
  .post("/accounts/:id/confirm-email", validate("param", z.object({ id: z.string().min(1).max(64) })), async (c) => {
    const [row] = await db.update(users).set({ emailVerified: true, updatedAt: new Date() }).where(and(eq(users.id, c.req.valid("param").id), eq(users.isAnonymous, false), eq(users.emailVerified, false))).returning({ email: users.email });
    if (!row) return fail(c, 404, "That account is already confirmed, or is a guest workspace");
    console.log(JSON.stringify({ level: "info", at: new Date().toISOString(), event: "email-confirmed-by-operator", operator: viewerOf(c).userId, user: c.req.valid("param").id }));
    return c.body(null, 204);
  })
  .post("/jobs/:id/retry", validate("param", z.object({ id: z.string().min(1).max(64) })), async (c) => {
    const [row] = await db.update(jobs).set({ state: "queued", attempts: 0, runAt: new Date(), finishedAt: null, lastError: null }).where(and(eq(jobs.id, c.req.valid("param").id), eq(jobs.state, "failed"))).returning({ id: jobs.id });
    return row ? c.body(null, 204) : fail(c, 404, "That job isn't waiting for a retry");
  });

/** POST /api/errors — what broke in the browser: grouped with the server's (no request body or page content is kept). */
export const clientErrorsRoute = new Hono().post(
  "/",
  // Every field is capped by the schema (the body was already parsed by the access check).
  validate("json", z.object({ kind: z.string().max(80).default("Error"), message: z.string().min(1).max(500), stack: z.string().max(4000).optional(), path: z.string().max(300) })),
  async (c) => {
    const e = c.req.valid("json");
    const v = viewerOf(c);
    // Ids in the page path would split one problem into many.
    const where = pagePathGroup(e.path);
    await recordError({ source: "client", kind: e.kind, message: e.message, where, userId: v.userId, stack: e.stack });
    return c.body(null, 204);
  },
);

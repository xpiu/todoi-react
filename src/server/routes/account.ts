// The signed-in person: profile (name, handle, avatar colour) and project invites.
import { zValidator } from "@hono/zod-validator";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { z } from "zod";

import { LABEL_COLORS, MEMBER_ROLES } from "../../shared/enums";
import { idSchema } from "../../shared/items";
import { prefsOf, prefsPatchSchema } from "../../shared/prefs";
import { hashToken, maybeViewer, viewerOf } from "../auth";
import { db } from "../db";
import { apiTokens, groups, invites, items, labels, lists, members, projects, users } from "../db/schema";
import { env } from "../env";
import { logActivity } from "../services/activity";
import { memberProjectIds } from "../services/projects";

export const meRoute = new Hono()
  .get("/", async (c) => {
    const v = viewerOf(c);
    const [u] = await db.select().from(users).where(eq(users.id, v.userId));
    if (!u) return c.json({ error: "Not found" }, 404);
    return c.json({ ...u, prefs: prefsOf(u.prefs), inboxListId: v.inboxListId });
  })
  // Merge a change into the account's preferences (concurrent devices each change their own keys).
  .patch("/prefs", zValidator("json", prefsPatchSchema), async (c) => {
    const v = viewerOf(c);
    const [u] = await db.update(users).set({ prefs: sql`${users.prefs} || ${JSON.stringify(c.req.valid("json"))}::jsonb` }).where(eq(users.id, v.userId)).returning({ prefs: users.prefs });
    return u ? c.json(prefsOf(u.prefs)) : c.json({ error: "Not found" }, 404);
  })
  .patch("/", zValidator("json", z.object({ name: z.string().trim().min(1).max(80).optional(), nickname: z.string().trim().min(1).max(40).regex(/^[a-z0-9._-]+$/i).nullable().optional(), avatarColor: z.enum(LABEL_COLORS).nullable().optional() })), async (c) => {
    const v = viewerOf(c);
    const [u] = await db.update(users).set(c.req.valid("json")).where(eq(users.id, v.userId)).returning();
    return u ? c.json(u) : c.json({ error: "Not found" }, 404);
  });

const DAY = 86400000;
export const tokensRoute = new Hono()
  .get("/", async (c) => {
    const v = viewerOf(c);
    const rows = await db.select().from(apiTokens).where(eq(apiTokens.userId, v.userId));
    return c.json(rows.map(({ hash: _h, ...t }) => t));
  })
  .post("/", zValidator("json", z.object({ name: z.string().trim().min(1).max(80), days: z.number().int().min(1).max(365).default(90) })), async (c) => {
    const v = viewerOf(c);
    const { name, days } = c.req.valid("json");
    const secret = `tdi_${nanoid(32)}`;
    const [row] = await db
      .insert(apiTokens)
      .values({ id: nanoid(), userId: v.userId, name, prefix: secret.slice(0, 8), hash: hashToken(secret), expiresAt: new Date(Date.now() + days * DAY) })
      .returning();
    const { hash: _h, ...t } = row!;
    return c.json({ ...t, secret }, 201);
  })
  .delete("/:id", zValidator("param", z.object({ id: z.string().min(1) })), async (c) => {
    const v = viewerOf(c);
    await db.update(apiTokens).set({ revokedAt: new Date() }).where(and(eq(apiTokens.id, c.req.valid("param").id), eq(apiTokens.userId, v.userId)));
    return c.body(null, 204);
  });

/** Everything the viewer can see, as one JSON document. */
export const exportRoute = new Hono().get("/", async (c) => {
  const v = viewerOf(c);
  const ids = await memberProjectIds(v.userId);
  const ps = ids.length ? await db.select().from(projects).where(inArray(projects.id, ids)) : [];
  const groupIds = [...new Set(ps.map((p) => p.groupId))];
  const [gs, ls, its, lbs] = await Promise.all([
    groupIds.length ? db.select().from(groups).where(inArray(groups.id, groupIds)) : [],
    db.select().from(lists).where(ids.length ? or(inArray(lists.projectId, ids), eq(lists.userId, v.userId)) : eq(lists.userId, v.userId)),
    db.select().from(items).where(ids.length ? or(inArray(items.projectId, ids), eq(items.listId, v.inboxListId)) : eq(items.listId, v.inboxListId)),
    ids.length ? db.select().from(labels).where(inArray(labels.projectId, ids)) : [],
  ]);
  const doc = { exportedAt: new Date().toISOString(), user: { id: v.userId, name: v.name, email: v.email }, groups: gs, projects: ps, lists: ls, labels: lbs, items: its };
  return c.body(JSON.stringify(doc, null, 2), 200, { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="todoi-export-${new Date().toISOString().slice(0, 10)}.json"` });
});

const inviteOut = async (code: string) => {
  const [row] = await db
    .select({ invite: invites, project: { id: projects.id, name: projects.name, icon: projects.icon, color: projects.color, description: projects.description }, groupName: groups.name, inviter: users.name })
    .from(invites)
    .innerJoin(projects, eq(projects.id, invites.projectId))
    .leftJoin(groups, eq(groups.id, projects.groupId))
    .leftJoin(users, eq(users.id, invites.invitedBy))
    .where(eq(invites.code, code));
  if (!row) return null;
  const [counts] = await db.select({ items: db.$count(items, and(eq(items.projectId, row.project.id), isNull(items.deletedAt), isNull(items.archivedAt))), members: db.$count(members, eq(members.projectId, row.project.id)) }).from(projects).where(eq(projects.id, row.project.id));
  return { ...row, itemCount: counts?.items ?? 0, memberCount: counts?.members ?? 0 };
};

export const projectInvitesRoute = new Hono()
  .get("/:id/invites", zValidator("param", z.object({ id: idSchema })), async (c) => {
    viewerOf(c);
    const rows = await db.select().from(invites).where(and(eq(invites.projectId, c.req.valid("param").id), isNull(invites.acceptedAt), isNull(invites.revokedAt)));
    return c.json(rows.map((r) => ({ ...r, url: `${env.APP_URL}/i/${r.code}` })));
  })
  .post("/:id/invites", zValidator("param", z.object({ id: idSchema })), zValidator("json", z.object({ email: z.string().email().optional(), role: z.enum(MEMBER_ROLES).default("editor"), days: z.number().int().min(1).max(90).default(14) })), async (c) => {
    const v = viewerOf(c);
    const { id } = c.req.valid("param");
    const { email, role, days } = c.req.valid("json");
    const [row] = await db
      .insert(invites)
      .values({ id: nanoid(), code: nanoid(12), projectId: id, email: email ?? null, role, invitedBy: v.userId, expiresAt: new Date(Date.now() + days * DAY) })
      .returning();
    await logActivity(db, { projectId: id, actorId: v.userId, type: "member", text: `invited ${email ?? "someone"} as ${role}` });
    return c.json({ ...row!, url: `${env.APP_URL}/i/${row!.code}` }, 201);
  });

export const invitesRoute = new Hono()
  .get("/:code", async (c) => {
    const inv = await inviteOut(c.req.param("code"));
    if (!inv) return c.json({ error: "Not found" }, 404);
    const v = maybeViewer(c);
    const already = v ? (await db.select().from(members).where(and(eq(members.projectId, inv.project.id), eq(members.userId, v.userId)))).length > 0 : false;
    const state = inv.invite.revokedAt ? "revoked" : inv.invite.acceptedAt ? "accepted" : inv.invite.expiresAt < new Date() ? "expired" : already ? "member" : "open";
    return c.json({ ...inv, state, signedIn: !!v && !v.isAnonymous });
  })
  .post("/:code/accept", async (c) => {
    const v = viewerOf(c);
    const inv = await inviteOut(c.req.param("code"));
    if (!inv) return c.json({ error: "Not found" }, 404);
    if (inv.invite.revokedAt || inv.invite.acceptedAt || inv.invite.expiresAt < new Date()) return c.json({ error: "This invite is no longer open" }, 410);
    if (inv.invite.email && inv.invite.email.toLowerCase() !== v.email.toLowerCase()) return c.json({ error: "This invite is for a different email address" }, 403);
    await db.transaction(async (tx) => {
      await tx.insert(members).values({ projectId: inv.project.id, userId: v.userId, role: inv.invite.role }).onConflictDoNothing();
      await tx.update(invites).set({ acceptedAt: new Date(), acceptedBy: v.userId }).where(eq(invites.id, inv.invite.id));
      await logActivity(tx, { projectId: inv.project.id, actorId: v.userId, type: "member", text: `joined as ${inv.invite.role}` });
    });
    return c.json({ projectId: inv.project.id });
  })
  .delete("/:code", async (c) => {
    viewerOf(c);
    await db.update(invites).set({ revokedAt: new Date() }).where(eq(invites.code, c.req.param("code")));
    return c.body(null, 204);
  });

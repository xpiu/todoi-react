// Everything that hangs off an item or a project besides lists: labels, assignees, watchers, comments,
// reactions, relations, saved views, the activity log and the Inbox's "Mark all read".
import { zValidator } from "@hono/zod-validator";
import { and, asc, desc, eq, getTableColumns, inArray, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import {
  createCommentSchema,
  createLabelSchema,
  createSavedViewSchema,
  mergeLabelSchema,
  reactSchema,
  relationSchema,
  setAssigneesSchema,
  setItemLabelsSchema,
  setWatchingSchema,
  updateCommentSchema,
  updateLabelSchema,
  updateSavedViewSchema,
} from "../../shared/content";
import type { RelationType } from "../../shared/enums";
import { idSchema } from "../../shared/items";
import { readableItemIds } from "../access";
import { viewerOf } from "../auth";
import { db } from "../db";
import { activity, attachments, commentReactions, comments, itemAssignees, itemLabels, itemRelations, itemWatchers, items, labels, savedViews, users } from "../db/schema";
import { logActivity, quote } from "../services/activity";

import { itemIsLive } from "../services/lifecycle";

const idParam = zValidator("param", z.object({ id: idSchema }));
const projectQuery = zValidator("query", z.object({ projectId: idSchema }));

const INVERSE: Record<RelationType, RelationType> = { blocked_by: "blocks", blocks: "blocked_by", related: "related" };

// ── Labels (per project) ───────────────────────────────────────────────────────
export const labelsRoute = new Hono()
  .get("/", projectQuery, async (c) => {
    const rows = await db.select().from(labels).where(eq(labels.projectId, c.req.valid("query").projectId)).orderBy(asc(labels.position), asc(labels.name));
    return c.json(rows);
  })
  .post("/", zValidator("json", createLabelSchema), async (c) => {
    const input = c.req.valid("json");
    const max = (await db.select({ max: sql<number>`coalesce(max(${labels.position}), -1)` }).from(labels).where(eq(labels.projectId, input.projectId)))[0]?.max ?? -1;
    const [row] = await db
      .insert(labels)
      .values({ ...input, position: max + 1 })
      .returning();
    return c.json(row!, 201);
  })
  .patch("/:id", idParam, zValidator("json", updateLabelSchema), async (c) => {
    const [row] = await db.update(labels).set(c.req.valid("json")).where(eq(labels.id, c.req.valid("param").id)).returning();
    return row ? c.json(row) : c.json({ error: "Not found" }, 404);
  })
  // Merge: every item with this label gets the target instead; the source label disappears.
  .post("/:id/merge", idParam, zValidator("json", mergeLabelSchema), async (c) => {
    const { id } = c.req.valid("param");
    const { intoLabelId } = c.req.valid("json");
    const moved = await db.transaction(async (tx) => {
      const rows = await tx.select({ itemId: itemLabels.itemId }).from(itemLabels).where(eq(itemLabels.labelId, id));
      if (rows.length) await tx.insert(itemLabels).values(rows.map((r) => ({ itemId: r.itemId, labelId: intoLabelId }))).onConflictDoNothing();
      await tx.delete(labels).where(eq(labels.id, id));
      return rows.length;
    });
    return c.json({ moved });
  })
  .delete("/:id", idParam, async (c) => {
    const [row] = await db.delete(labels).where(eq(labels.id, c.req.valid("param").id)).returning({ id: labels.id });
    return row ? c.body(null, 204) : c.json({ error: "Not found" }, 404);
  });

// ── On one item ────────────────────────────────────────────────────────────────
export const itemContentRoute = new Hono()
  // Labels, assignees, watchers, comments (with reactions) and relations (both directions) of an item.
  .get("/:id/details", idParam, async (c) => {
    const { id } = c.req.valid("param");
    const viewer = viewerOf(c);
    const [item] = await db.select().from(items).where(eq(items.id, id));
    if (!item) return c.json({ error: "Not found" }, 404);
    const [labelRows, assigneeRows, watcherRows, commentRows, relationRows, subitems, attachmentRows] = await Promise.all([
      db.select({ labelId: itemLabels.labelId }).from(itemLabels).where(eq(itemLabels.itemId, id)),
      db.select({ userId: itemAssignees.userId }).from(itemAssignees).where(eq(itemAssignees.itemId, id)),
      db.select({ userId: itemWatchers.userId }).from(itemWatchers).where(eq(itemWatchers.itemId, id)),
      db.select().from(comments).where(eq(comments.itemId, id)).orderBy(asc(comments.createdAt)),
      db.select().from(itemRelations).where(or(eq(itemRelations.itemId, id), eq(itemRelations.targetId, id))),
      db.select().from(items).where(and(eq(items.parentItemId, id), itemIsLive)).orderBy(asc(items.position)),
      db.select().from(attachments).where(eq(attachments.itemId, id)).orderBy(asc(attachments.createdAt)),
    ]);
    const reactionRows = commentRows.length ? await db.select().from(commentReactions).where(inArray(commentReactions.commentId, commentRows.map((r) => r.id))) : [];
    const relations = relationRows.map((r) => (r.itemId === id ? { type: r.type, itemId: r.targetId } : { type: INVERSE[r.type], itemId: r.itemId }));
    const relatedIds = relations.map((r) => r.itemId);
    const relatedRows = relatedIds.length ? await db.select({ id: items.id, title: items.title, keyNumber: items.keyNumber, listId: items.listId, projectId: items.projectId, status: items.status, done: items.done }).from(items).where(inArray(items.id, relatedIds)) : [];
    // Relations stay within one project, but never describe an item the viewer could not open themselves.
    const readable = await readableItemIds(viewer, relatedRows);
    const related = relatedRows.filter((r) => readable.has(r.id)).map(({ projectId: _projectId, ...r }) => r);
    return c.json({
      labelIds: labelRows.map((r) => r.labelId),
      assigneeIds: assigneeRows.map((r) => r.userId),
      watching: watcherRows.some((r) => r.userId === viewer.userId),
      watcherIds: watcherRows.map((r) => r.userId),
      comments: commentRows.map((cm) => ({ ...cm, reactions: reactionRows.filter((r) => r.commentId === cm.id) })),
      relations: relations.flatMap((r) => {
        const target = related.find((x) => x.id === r.itemId);
        return target ? [{ ...r, item: target }] : [];
      }),
      subitems,
      attachments: attachmentRows,
    });
  })
  .put("/:id/labels", idParam, zValidator("json", setItemLabelsSchema), async (c) => {
    const { id } = c.req.valid("param");
    const { labelIds } = c.req.valid("json");
    await db.transaction(async (tx) => {
      await tx.delete(itemLabels).where(eq(itemLabels.itemId, id));
      if (labelIds.length) await tx.insert(itemLabels).values(labelIds.map((labelId) => ({ itemId: id, labelId })));
    });
    return c.json({ labelIds });
  })
  .put("/:id/assignees", idParam, zValidator("json", setAssigneesSchema), async (c) => {
    const { id } = c.req.valid("param");
    const { userIds } = c.req.valid("json");
    await db.transaction(async (tx) => {
      await tx.delete(itemAssignees).where(eq(itemAssignees.itemId, id));
      if (userIds.length) await tx.insert(itemAssignees).values(userIds.map((userId) => ({ itemId: id, userId })));
    });
    return c.json({ userIds });
  })
  .put("/:id/watch", idParam, zValidator("json", setWatchingSchema), async (c) => {
    const { id } = c.req.valid("param");
    const viewer = viewerOf(c);
    const { watching } = c.req.valid("json");
    if (watching) await db.insert(itemWatchers).values({ itemId: id, userId: viewer.userId }).onConflictDoNothing();
    else await db.delete(itemWatchers).where(and(eq(itemWatchers.itemId, id), eq(itemWatchers.userId, viewer.userId)));
    return c.json({ watching });
  })
  .post("/:id/comments", idParam, zValidator("json", createCommentSchema), async (c) => {
    const { id } = c.req.valid("param");
    const viewer = viewerOf(c);
    const [item] = await db.select().from(items).where(eq(items.id, id));
    if (!item) return c.json({ error: "Not found" }, 404);
    // The client keeps one id per draft, so a retry after a lost response updates instead of duplicating.
    const [row] = await db
      .insert(comments)
      .values({ ...c.req.valid("json"), itemId: id, authorId: viewer.userId })
      .onConflictDoUpdate({ target: comments.id, set: { body: sql`excluded.body` }, setWhere: and(eq(comments.itemId, id), eq(comments.authorId, viewer.userId)) })
      .returning({ ...getTableColumns(comments), inserted: sql<boolean>`(xmax = 0)` });
    if (!row) return c.json({ error: "That comment id is already in use" }, 409);
    const { inserted, ...comment } = row;
    if (inserted) await logActivity(db, { projectId: item.projectId, actorId: viewer.userId, type: "comment", text: `commented on ${quote(item.title)}`, itemId: id });
    return c.json({ ...comment, reactions: [] }, 201);
  })
  .post("/:id/relations", idParam, zValidator("json", relationSchema), async (c) => {
    const { id } = c.req.valid("param");
    const { targetId, type } = c.req.valid("json");
    if (targetId === id) return c.json({ error: "An item cannot relate to itself" }, 400);
    // Stored once: "blocks" is written as the target's "blocked_by".
    const stored = type === "blocks" ? { itemId: targetId, targetId: id, type: "blocked_by" as const } : { itemId: id, targetId, type };
    await db.insert(itemRelations).values(stored).onConflictDoNothing();
    return c.json({ targetId, type }, 201);
  })
  .delete("/:id/relations", idParam, zValidator("json", relationSchema), async (c) => {
    const { id } = c.req.valid("param");
    const { targetId, type } = c.req.valid("json");
    const stored = type === "blocks" ? { itemId: targetId, targetId: id, type: "blocked_by" as const } : { itemId: id, targetId, type };
    await db.delete(itemRelations).where(and(eq(itemRelations.itemId, stored.itemId), eq(itemRelations.targetId, stored.targetId), eq(itemRelations.type, stored.type)));
    return c.body(null, 204);
  });

// ── Comments ───────────────────────────────────────────────────────────────────
export const commentsRoute = new Hono()
  .patch("/:id", idParam, zValidator("json", updateCommentSchema), async (c) => {
    const [row] = await db
      .update(comments)
      .set({ body: c.req.valid("json").body, editedAt: new Date() })
      .where(eq(comments.id, c.req.valid("param").id))
      .returning();
    return row ? c.json(row) : c.json({ error: "Not found" }, 404);
  })
  .delete("/:id", idParam, async (c) => {
    const [row] = await db.delete(comments).where(eq(comments.id, c.req.valid("param").id)).returning({ id: comments.id });
    return row ? c.body(null, 204) : c.json({ error: "Not found" }, 404);
  })
  // Toggle the caller's reaction.
  .post("/:id/reactions", idParam, zValidator("json", reactSchema), async (c) => {
    const { id } = c.req.valid("param");
    const { emoji } = c.req.valid("json");
    const viewer = viewerOf(c);
    const where = and(eq(commentReactions.commentId, id), eq(commentReactions.userId, viewer.userId), eq(commentReactions.emoji, emoji));
    const [existing] = await db.select().from(commentReactions).where(where);
    if (existing) {
      await db.delete(commentReactions).where(where);
      return c.json({ emoji, reacted: false });
    }
    await db.insert(commentReactions).values({ commentId: id, userId: viewer.userId, emoji });
    return c.json({ emoji, reacted: true });
  });

// ── Saved views ────────────────────────────────────────────────────────────────
export const savedViewsRoute = new Hono()
  // Shared views plus the caller's own.
  .get("/", projectQuery, async (c) => {
    const viewer = viewerOf(c);
    const rows = await db
      .select()
      .from(savedViews)
      .where(and(eq(savedViews.projectId, c.req.valid("query").projectId), or(eq(savedViews.shared, true), eq(savedViews.ownerId, viewer.userId))))
      .orderBy(asc(savedViews.position), asc(savedViews.createdAt));
    return c.json(rows);
  })
  .post("/", zValidator("json", createSavedViewSchema), async (c) => {
    const viewer = viewerOf(c);
    const input = c.req.valid("json");
    const max = (await db.select({ max: sql<number>`coalesce(max(${savedViews.position}), -1)` }).from(savedViews).where(eq(savedViews.projectId, input.projectId)))[0]?.max ?? -1;
    const [row] = await db
      .insert(savedViews)
      .values({ ...input, shared: input.shared ?? false, ownerId: viewer.userId, position: max + 1 })
      .returning();
    return c.json(row!, 201);
  })
  .patch("/:id", idParam, zValidator("json", updateSavedViewSchema), async (c) => {
    const [row] = await db.update(savedViews).set(c.req.valid("json")).where(eq(savedViews.id, c.req.valid("param").id)).returning();
    return row ? c.json(row) : c.json({ error: "Not found" }, 404);
  })
  .delete("/:id", idParam, async (c) => {
    const [row] = await db.delete(savedViews).where(eq(savedViews.id, c.req.valid("param").id)).returning({ id: savedViews.id });
    return row ? c.body(null, 204) : c.json({ error: "Not found" }, 404);
  });

// ── Activity (read) ────────────────────────────────────────────────────────────
export const activityRoute = new Hono().get("/", projectQuery, zValidator("query", z.object({ projectId: idSchema, limit: z.coerce.number().int().min(1).max(200).default(60) })), async (c) => {
  const { projectId, limit } = c.req.valid("query");
  const rows = await db
    .select({ entry: activity, actor: { id: users.id, name: users.name, nickname: users.nickname, avatarColor: users.avatarColor } })
    .from(activity)
    .leftJoin(users, eq(users.id, activity.actorId))
    .where(eq(activity.projectId, projectId))
    .orderBy(desc(activity.createdAt))
    .limit(limit);
  return c.json(rows.map((r) => ({ ...r.entry, actor: r.actor })));
});

// ── Inbox ──────────────────────────────────────────────────────────────────────
export const inboxRoute = new Hono()
  .get("/unread", async (c) => {
    const viewer = viewerOf(c);
    const n = (await db.select({ n: sql<number>`count(*)::int` }).from(items).where(and(eq(items.listId, viewer.inboxListId), eq(items.unread, true), itemIsLive)))[0]?.n ?? 0;
    return c.json({ unread: n });
  })
  .post("/mark-all-read", async (c) => {
    const viewer = viewerOf(c);
    const rows = await db
      .update(items)
      .set({ unread: false })
      .where(and(eq(items.listId, viewer.inboxListId), eq(items.unread, true)))
      .returning({ id: items.id });
    return c.json({ marked: rows.length });
  });

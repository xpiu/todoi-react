// Export everything as a Todoi archive (src/shared/archive.ts) and restore one. Export collects every
// project the person is a member of, their own groups and their Inbox — archived and trashed content
// too — with comments, reactions, relations, saved views, activity and the attachment bytes. Restore
// validates every file first, then creates fresh copies for the person restoring (new ids throughout)
// in one transaction; attachment bytes are written first under cleanup leases, as uploads are, so a
// failed restore leaves no files behind. Other people's work keeps its attribution in text.
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import { nanoid } from "nanoid";

import { ARCHIVE_FORMAT, ARCHIVE_MANIFEST, ARCHIVE_VERSION, ArchiveRejected, checkArchive, MAX_ARCHIVE_BYTES, NOT_AN_EXPORT, restoringAs, summarizeArchive, type ArchiveManifest, type ArchiveProject, type ArchiveSummary } from "../../shared/archive";
import { importedCommentBody } from "../../shared/import";
import { ATTACHMENT_QUOTA_BYTES, quotaMessage } from "../../shared/uploads";
import { db, type Tx } from "../db";
import { activity, attachments, commentReactions, comments, groups, itemAssignees, itemLabels, itemRelations, items, itemWatchers, labels, lists, members, projects, savedViews, uploadCleanup, users, type ItemSyncExtra } from "../db/schema";
import { safeName, UploadRejected } from "./attachments";
import { drainUploadCleanup } from "./uploadCleanup";
import { readUpload, saveUpload } from "./uploads";

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const dayOf = (d: Date) => d.toISOString().slice(0, 10);

// ── Export ───────────────────────────────────────────────────────────────────────────────────────────
async function projectRecord(scope: { projectId: string | null; listIds: string[] }, viewerId: string, people: Set<string>, files: Zippable): Promise<ArchiveProject> {
  const [project] = scope.projectId ? await db.select().from(projects).where(eq(projects.id, scope.projectId)) : [];
  const ls = scope.projectId ? await db.select().from(lists).where(eq(lists.projectId, scope.projectId)).orderBy(asc(lists.position)) : await db.select().from(lists).where(inArray(lists.id, scope.listIds));
  const its = scope.projectId ? await db.select().from(items).where(eq(items.projectId, scope.projectId)) : await db.select().from(items).where(and(inArray(items.listId, scope.listIds), sql`${items.projectId} is null`));
  const ids = its.map((i) => i.id);
  const has = <T,>(q: () => Promise<T[]>) => (ids.length ? q() : Promise.resolve([] as T[]));
  const [ms, lbs, il, ia, iw, rel, cs, atts, views, acts] = await Promise.all([
    scope.projectId ? db.select().from(members).where(eq(members.projectId, scope.projectId)) : [],
    scope.projectId ? db.select().from(labels).where(eq(labels.projectId, scope.projectId)) : [],
    has(() => db.select().from(itemLabels).where(inArray(itemLabels.itemId, ids))),
    has(() => db.select().from(itemAssignees).where(inArray(itemAssignees.itemId, ids))),
    has(() => db.select().from(itemWatchers).where(inArray(itemWatchers.itemId, ids))),
    has(() => db.select().from(itemRelations).where(and(inArray(itemRelations.itemId, ids), inArray(itemRelations.targetId, ids)))),
    has(() => db.select().from(comments).where(inArray(comments.itemId, ids)).orderBy(asc(comments.createdAt))),
    has(() => db.select().from(attachments).where(inArray(attachments.itemId, ids))),
    scope.projectId ? db.select().from(savedViews).where(and(eq(savedViews.projectId, scope.projectId), or(eq(savedViews.shared, true), eq(savedViews.ownerId, viewerId)))) : [],
    scope.projectId ? db.select().from(activity).where(eq(activity.projectId, scope.projectId)).orderBy(asc(activity.createdAt)) : [],
  ]);
  const reactions = cs.length ? await db.select().from(commentReactions).where(inArray(commentReactions.commentId, cs.map((c) => c.id))) : [];
  const see = (uid: string | null) => {
    if (uid) people.add(uid);
    return uid;
  };
  for (const a of atts) {
    const bytes = await readUpload(a.storageKey);
    // A file whose bytes are gone (a damaged volume) stays out rather than failing the whole export.
    if (bytes) files[`attachments/${a.id}`] = [new Uint8Array(bytes), { level: 0 }];
  }
  return {
    project: project ? { id: project.id, groupId: project.groupId, name: project.name, icon: project.icon, color: project.color, description: project.description, visibility: project.visibility, defaultView: project.defaultView, linkStatuses: project.linkStatuses, checkedMove: project.checkedMove, position: project.position, archivedAt: iso(project.archivedAt), deletedAt: iso(project.deletedAt), createdAt: project.createdAt.toISOString() } : null,
    members: ms.map((m) => ({ userId: see(m.userId)!, role: m.role })),
    lists: ls.map((l) => ({ id: l.id, name: l.name, icon: l.icon, statusRole: l.statusRole, position: l.position, hidden: l.hidden, externalId: l.externalId })),
    labels: lbs.map((l) => ({ id: l.id, name: l.name, color: l.color, position: l.position })),
    items: its.map((i) => ({
      id: i.id, listId: i.listId, parentItemId: i.parentItemId, keyNumber: i.keyNumber, title: i.title, description: i.description, status: i.status, priorStatus: i.priorStatus, done: i.done, priority: i.priority, startDate: i.startDate, dueDate: i.dueDate, dueTime: i.dueTime,
      repeatRule: (i.repeatRule as Record<string, unknown> | null) ?? null, repeatCount: i.repeatCount, cover: (i.cover as Record<string, unknown> | null) ?? null, notification: (i.notification as Record<string, unknown> | null) ?? null, unread: i.unread, position: i.position, createdBy: see(i.createdBy),
      externalId: i.externalId, syncExtra: (i.syncExtra as Record<string, unknown> | null) ?? null, archivedAt: iso(i.archivedAt), deletedAt: iso(i.deletedAt), createdAt: i.createdAt.toISOString(),
      labelIds: il.filter((x) => x.itemId === i.id).map((x) => x.labelId), assigneeIds: ia.filter((x) => x.itemId === i.id).map((x) => see(x.userId)!), watcherIds: iw.filter((x) => x.itemId === i.id).map((x) => see(x.userId)!),
    })),
    relations: rel.map((r) => ({ itemId: r.itemId, targetId: r.targetId, type: r.type })),
    comments: cs.map((c) => ({ id: c.id, itemId: c.itemId, authorId: see(c.authorId)!, body: c.body, replyToId: c.replyToId, editedAt: iso(c.editedAt), createdAt: c.createdAt.toISOString(), fileOrigin: (c.fileOrigin as Record<string, unknown> | null) ?? null, reactions: reactions.filter((r) => r.commentId === c.id).map((r) => ({ userId: see(r.userId)!, emoji: r.emoji })) })),
    attachments: atts.filter((a) => files[`attachments/${a.id}`]).map((a) => ({ id: a.id, itemId: a.itemId, name: a.name, size: a.size, mime: a.mime, uploadedBy: see(a.uploadedBy), createdAt: a.createdAt.toISOString(), file: `attachments/${a.id}` })),
    savedViews: views.map((v) => ({ id: v.id, ownerId: see(v.ownerId)!, name: v.name, shared: v.shared, definition: v.definition as Record<string, unknown>, position: v.position })),
    activity: acts.map((a) => ({ itemId: a.itemId, actorId: see(a.actorId), type: a.type, text: a.text, itemKey: a.itemKey, createdAt: a.createdAt.toISOString() })),
  };
}

/** The whole account as a zip. */
export async function buildArchive(viewer: { userId: string; name: string; email: string; inboxListId: string }): Promise<Uint8Array> {
  const projectIds = (await db.select({ id: members.projectId }).from(members).where(eq(members.userId, viewer.userId))).map((m) => m.id);
  const ps = projectIds.length ? await db.select({ id: projects.id, groupId: projects.groupId, name: projects.name }).from(projects).where(inArray(projects.id, projectIds)).orderBy(asc(projects.position)) : [];
  const gs = await db.select().from(groups).where(or(eq(groups.ownerId, viewer.userId), ps.length ? inArray(groups.id, [...new Set(ps.map((p) => p.groupId))]) : sql`false`)).orderBy(asc(groups.position));
  const people = new Set<string>([viewer.userId]);
  const files: Zippable = {};
  const manifestProjects: ArchiveManifest["projects"] = [];
  for (const p of ps) {
    const record = await projectRecord({ projectId: p.id, listIds: [] }, viewer.userId, people, files);
    const file = `projects/${p.id}.json`;
    files[file] = strToU8(JSON.stringify(record, null, 2));
    manifestProjects.push({ id: p.id, groupId: p.groupId, name: p.name, file });
  }
  const inbox = await projectRecord({ projectId: null, listIds: [viewer.inboxListId] }, viewer.userId, people, files);
  files["inbox.json"] = strToU8(JSON.stringify(inbox, null, 2));
  const who = await db.select({ id: users.id, name: users.name, email: users.email, nickname: users.nickname }).from(users).where(inArray(users.id, [...people]));
  const manifest: ArchiveManifest = {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    exportedAt: new Date().toISOString(),
    account: { id: viewer.userId, name: viewer.name, email: viewer.email },
    people: who,
    groups: gs.map((g) => ({ id: g.id, name: g.name, icon: g.icon, keyPrefix: g.keyPrefix, position: g.position, archivedAt: iso(g.archivedAt), deletedAt: iso(g.deletedAt) })),
    projects: manifestProjects,
    inbox: "inbox.json",
  };
  files[ARCHIVE_MANIFEST] = strToU8(JSON.stringify(manifest, null, 2));
  return zipSync(files, { level: 6 });
}

// ── Restore ──────────────────────────────────────────────────────────────────────────────────────────
/** Unzip and validate everything before anything is written. */
export function readArchive(bytes: Uint8Array): { manifest: ArchiveManifest; files: ArchiveProject[]; blobs: Record<string, Uint8Array> } {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new ArchiveRejected(NOT_AN_EXPORT);
  }
  const { manifest, files } = checkArchive((name) => (entries[name] ? strFromU8(entries[name]) : undefined), (name) => name in entries);
  return { manifest, files, blobs: entries };
}

export async function restoreArchive(bytes: Uint8Array, viewer: { userId: string; email: string; inboxListId: string }): Promise<ArchiveSummary> {
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) throw new ArchiveRejected("The export is larger than 512 MB", 413);
  const { manifest, files, blobs } = readArchive(bytes);
  const summary = summarizeArchive(manifest, files, viewer);
  const mine = restoringAs(manifest, viewer);
  const people = new Map(manifest.people.map((p) => [p.id, p]));
  const nameOf = (uid: string | null) => (uid ? (people.get(uid)?.nickname || people.get(uid)?.name || "Someone") : "Someone");
  const me = (uid: string | null) => (uid && mine.has(uid) ? viewer.userId : null);

  // Quota: restored files count as the restorer's uploads.
  const used = Number((await db.execute<{ n: string }>(sql`select coalesce(sum(size), 0)::bigint as n from ${attachments} where ${attachments.uploadedBy} = ${viewer.userId}`)).rows[0]?.n ?? 0);
  if (used + summary.attachmentBytes > ATTACHMENT_QUOTA_BYTES.account) throw new ArchiveRejected(quotaMessage(false), 403);

  // Bytes first, under leases: a failed restore lets the cleanup job remove them.
  const allAttachments = files.flatMap((f) => f.attachments);
  const keys = new Map(allAttachments.map((a) => [a.id, nanoid()]));
  if (keys.size) await db.insert(uploadCleanup).values([...keys.values()].map((storageKey) => ({ storageKey, nextAttemptAt: sql`now() + interval '1 hour'` })));
  try {
    for (const a of allAttachments) await saveUpload(blobs[a.file]!, keys.get(a.id));
    await db.transaction((tx) => restoreRows(tx, manifest, files, viewer, { me, nameOf, keys }));
    if (keys.size) await db.delete(uploadCleanup).where(inArray(uploadCleanup.storageKey, [...keys.values()]));
  } catch (e) {
    if (keys.size) {
      await db.update(uploadCleanup).set({ nextAttemptAt: sql`now()` }).where(inArray(uploadCleanup.storageKey, [...keys.values()])).catch(() => undefined);
      await drainUploadCleanup();
    }
    if (e instanceof UploadRejected) throw new ArchiveRejected(e.message, e.status === 413 ? 413 : 422);
    throw e;
  }
  return summary;
}

interface RestoreCtx {
  me: (uid: string | null) => string | null;
  nameOf: (uid: string | null) => string;
  keys: Map<string, string>;
}

async function restoreRows(tx: Tx, manifest: ArchiveManifest, files: ArchiveProject[], viewer: { userId: string; inboxListId: string }, ctx: RestoreCtx) {
  const newId = new Map<string, string>();
  const map = (old: string) => {
    let n = newId.get(old);
    if (!n) newId.set(old, (n = nanoid()));
    return n;
  };
  const date = (v: string | null) => (v ? new Date(v) : null);
  // Groups go after the person's own, in their order; each counts keys on from its highest.
  const [{ max } = { max: -1 }] = (await tx.execute<{ max: number }>(sql`select coalesce(max(position), -1)::int as max from ${groups} where owner_id = ${viewer.userId}`)).rows;
  const highestKey = new Map<string, number>();
  for (const f of files) if (f.project) for (const i of f.items) highestKey.set(f.project.groupId, Math.max(highestKey.get(f.project.groupId) ?? 0, i.keyNumber ?? 0));
  if (manifest.groups.length) await tx.insert(groups).values(manifest.groups.map((g, i) => ({ id: map(g.id), name: g.name, icon: g.icon, keyPrefix: g.keyPrefix, position: max + 1 + i, ownerId: viewer.userId, nextItemNumber: (highestKey.get(g.id) ?? 0) + 1, archivedAt: date(g.archivedAt), deletedAt: date(g.deletedAt) })));

  for (const f of files) {
    const projectId = f.project ? map(f.project.id) : null;
    if (f.project) {
      const p = f.project;
      await tx.insert(projects).values({ id: projectId!, groupId: map(p.groupId), name: p.name, icon: p.icon, color: p.color, description: p.description, visibility: p.visibility, defaultView: p.defaultView, linkStatuses: p.linkStatuses, checkedMove: p.checkedMove, position: p.position, archivedAt: date(p.archivedAt), deletedAt: date(p.deletedAt), createdAt: new Date(p.createdAt) });
      await tx.insert(members).values({ projectId: projectId!, userId: viewer.userId, role: "owner" });
      if (f.lists.length) await tx.insert(lists).values(f.lists.map((l) => ({ id: map(l.id), projectId, name: l.name, icon: l.icon, statusRole: l.statusRole, position: l.position, hidden: l.hidden })));
      if (f.labels.length) await tx.insert(labels).values(f.labels.map((l) => ({ id: map(l.id), projectId: projectId!, name: l.name, color: l.color, position: l.position })));
    } else {
      // The Inbox: its list is the restorer's own Inbox.
      for (const l of f.lists) newId.set(l.id, viewer.inboxListId);
    }
    // Parents before subitems, so the parent key exists when a subitem points at it.
    const ordered = [...f.items].sort((a, b) => Number(!!a.parentItemId) - Number(!!b.parentItemId));
    for (let i = 0; i < ordered.length; i += 500) {
      await tx.insert(items).values(
        ordered.slice(i, i + 500).map((it) => {
          const others = it.assigneeIds.filter((a) => !ctx.me(a)).map((a) => ctx.nameOf(a));
          const extra = (it.syncExtra ?? {}) as ItemSyncExtra;
          const syncExtra = others.length ? { ...extra, assignees: [...new Set([...(extra.assignees ?? []), ...others])] } : (it.syncExtra as ItemSyncExtra | null);
          return {
            id: map(it.id), projectId, listId: map(it.listId), parentItemId: it.parentItemId ? map(it.parentItemId) : null, keyNumber: projectId ? it.keyNumber : null, title: it.title, description: it.description, status: it.status, priorStatus: it.priorStatus, done: it.done, priority: it.priority,
            startDate: it.startDate, dueDate: it.dueDate, dueTime: it.dueTime, repeatRule: it.repeatRule as never, repeatCount: it.repeatCount, cover: it.cover as never, notification: it.notification as never, unread: it.unread, position: it.position, createdBy: ctx.me(it.createdBy),
            externalId: null, syncExtra, archivedAt: date(it.archivedAt), deletedAt: date(it.deletedAt), createdAt: new Date(it.createdAt),
          };
        }),
      );
    }
    const labelLinks = f.items.flatMap((it) => it.labelIds.filter((l) => newId.has(l)).map((l) => ({ itemId: map(it.id), labelId: map(l) })));
    if (labelLinks.length) await tx.insert(itemLabels).values(labelLinks).onConflictDoNothing();
    const assigned = f.items.flatMap((it) => (it.assigneeIds.some((a) => ctx.me(a)) ? [{ itemId: map(it.id), userId: viewer.userId }] : []));
    if (assigned.length) await tx.insert(itemAssignees).values(assigned).onConflictDoNothing();
    const watching = f.items.flatMap((it) => (it.watcherIds.some((w) => ctx.me(w)) ? [{ itemId: map(it.id), userId: viewer.userId }] : []));
    if (watching.length) await tx.insert(itemWatchers).values(watching).onConflictDoNothing();
    const rels = f.relations.filter((r) => newId.has(r.itemId) && newId.has(r.targetId)).map((r) => ({ itemId: map(r.itemId), targetId: map(r.targetId), type: r.type }));
    if (rels.length) await tx.insert(itemRelations).values(rels).onConflictDoNothing();
    // Comments: yours stay yours; other people's come back under your name, headed with theirs and the date.
    const depth = new Map<string, number>();
    const notes = f.comments.map((c) => {
      const d = c.replyToId ? (depth.get(c.replyToId) ?? 1) + 1 : 1;
      depth.set(c.id, d);
      const author = ctx.me(c.authorId);
      const origin = author ? (c.fileOrigin as never) : { author: ctx.nameOf(c.authorId), at: dayOf(new Date(c.createdAt)), text: c.body, depth: d };
      return { id: map(c.id), itemId: map(c.itemId), authorId: viewer.userId, body: author ? c.body : importedCommentBody(origin), replyToId: c.replyToId ? map(c.replyToId) : null, editedAt: date(c.editedAt), createdAt: new Date(c.createdAt), fileOrigin: origin ?? null };
    });
    for (let i = 0; i < notes.length; i += 500) await tx.insert(comments).values(notes.slice(i, i + 500));
    const reacts = f.comments.flatMap((c) => c.reactions.filter((r) => ctx.me(r.userId)).map((r) => ({ commentId: map(c.id), userId: viewer.userId, emoji: r.emoji })));
    if (reacts.length) await tx.insert(commentReactions).values(reacts).onConflictDoNothing();
    if (f.attachments.length) await tx.insert(attachments).values(f.attachments.map((a) => ({ id: map(a.id), itemId: map(a.itemId), name: safeName(a.name), size: a.size, mime: a.mime, storageKey: ctx.keys.get(a.id)!, uploadedBy: viewer.userId, createdAt: new Date(a.createdAt) })));
    if (projectId) {
      const views = f.savedViews.filter((v) => v.shared || ctx.me(v.ownerId));
      if (views.length) await tx.insert(savedViews).values(views.map((v) => ({ id: map(v.id), projectId, ownerId: viewer.userId, name: v.name, shared: v.shared, definition: v.definition as never, position: v.position })));
      // Your activity and Todoi's own come back; other people's lines would read as Todoi's, so they stay out (the summary says so).
      const acts = f.activity.filter((a) => !a.actorId || ctx.me(a.actorId));
      if (acts.length) await tx.insert(activity).values(acts.map((a) => ({ id: nanoid(), projectId, itemId: a.itemId && newId.has(a.itemId) ? map(a.itemId) : null, actorId: ctx.me(a.actorId), type: a.type, text: a.text, itemKey: a.itemKey, createdAt: new Date(a.createdAt) })));
    }
  }
}

export { ArchiveRejected };

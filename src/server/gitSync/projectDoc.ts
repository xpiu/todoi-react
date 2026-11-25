// A project as a project document (src/shared/projectDoc) and back. `readProjectDoc` builds the document
// Git sync merges as "ours", giving every live list and item a file id first (bookkeeping that doesn't
// bump row versions; see migration 0021). `applyProjectDoc` makes the project match a merged document in
// the caller's transaction: lists and items are created, edited, moved and reordered, items the document
// dropped go to the Trash (never deleted outright), and what Todoi has no column for — custom fields,
// assignees who aren't members, attachment links — is kept in items.sync_extra so the file keeps it too.
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";

import { statusChange } from "../../shared/completion";
import { LABEL_COLORS } from "../../shared/enums";
import { importedCommentBody } from "../../shared/import";
import { suggestedRoleForTitle, type ItemStatus } from "../../shared/item-status";
import { newEmbridgeId } from "../../shared/embridge";
import { canonicalDoc } from "../../shared/projectDoc/merge";
import { docSubitem, type DocComment, type DocItem, type DocSubitem, type ProjectDoc } from "../../shared/projectDoc/model";
import type { Tx } from "../db";
import { comments, itemAssignees, itemLabels, items, labels, lists, members, projects, users, type Item, type ItemSyncExtra } from "../db/schema";
import { logActivity } from "../services/activity";
import { itemIsLive } from "../services/lifecycle";
import { issueKeyNumbers } from "../services/projects";

const dateOf = (d: Date) => d.toISOString().slice(0, 10);
/** Content equality for jsonb values, whatever their key order. */
const sameJson = (a: unknown, b: unknown) => {
  const norm = (v: unknown): unknown => (Array.isArray(v) ? v.map(norm) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([x], [y]) => (x < y ? -1 : 1)).map(([k, x]) => [k, norm(x)])) : (v ?? null));
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
};
const nameKey = (s: string) => s.trim().replace(/^@/, "").toLowerCase();

interface People {
  /** How a member is written in a file: their @handle, else their name */
  label: Map<string, string>;
  /** A name or handle from a file → the member it means */
  byName: Map<string, string>;
}
async function projectPeople(tx: Tx, projectId: string): Promise<People> {
  const rows = await tx.select({ id: users.id, name: users.name, nickname: users.nickname }).from(members).innerJoin(users, eq(users.id, members.userId)).where(eq(members.projectId, projectId));
  const label = new Map<string, string>(), byName = new Map<string, string>();
  for (const u of rows) {
    label.set(u.id, u.nickname || u.name);
    for (const n of [u.name, u.nickname]) if (n && !byName.has(nameKey(n))) byName.set(nameKey(n), u.id);
  }
  return { label, byName };
}

/** The project as a document, every live list and item with a unique file id (assigned and saved where missing). */
export async function readProjectDoc(tx: Tx, projectId: string, newId: () => string = newEmbridgeId): Promise<ProjectDoc> {
  const [project] = await tx.select().from(projects).where(eq(projects.id, projectId));
  if (!project) throw new Error(`Project ${projectId} not found`);
  const ls = await tx.select().from(lists).where(and(eq(lists.projectId, projectId), eq(lists.kind, "project"))).orderBy(asc(lists.position), asc(lists.createdAt));
  const rows = await tx.select().from(items).where(and(eq(items.projectId, projectId), itemIsLive)).orderBy(asc(items.position), asc(items.createdAt));
  const ids = rows.map((r) => r.id);
  const [labelRows, assigneeRows, commentRows, people] = await Promise.all([
    ids.length ? tx.select({ itemId: itemLabels.itemId, name: labels.name }).from(itemLabels).innerJoin(labels, eq(labels.id, itemLabels.labelId)).where(inArray(itemLabels.itemId, ids)) : [],
    ids.length ? tx.select().from(itemAssignees).where(inArray(itemAssignees.itemId, ids)) : [],
    ids.length ? tx.select().from(comments).where(inArray(comments.itemId, ids)).orderBy(asc(comments.createdAt)) : [],
    projectPeople(tx, projectId),
  ]);

  // File ids: keep each row's own unless another row already has it; give fresh ones to the rest.
  const seenItems = new Set<string>(), seenLists = new Set<string>();
  const fresh = (seen: Set<string>) => {
    let id = newId();
    while (seen.has(id)) id = newId();
    seen.add(id);
    return id;
  };
  const listIds = new Map<string, string>(), itemIds = new Map<string, string>();
  const missingLists: Array<[string, string]> = [], missingItems: Array<[string, string]> = [];
  for (const l of ls) {
    const id = l.externalId && !seenLists.has(l.externalId) ? (seenLists.add(l.externalId), l.externalId) : fresh(seenLists);
    listIds.set(l.id, id);
    if (id !== l.externalId) missingLists.push([l.id, id]);
  }
  for (const r of rows) {
    const id = r.externalId && !seenItems.has(r.externalId) ? (seenItems.add(r.externalId), r.externalId) : fresh(seenItems);
    itemIds.set(r.id, id);
    if (id !== r.externalId) missingItems.push([r.id, id]);
  }
  for (const [id, externalId] of missingLists) await tx.update(lists).set({ externalId }).where(eq(lists.id, id));
  for (const [id, externalId] of missingItems) await tx.update(items).set({ externalId }).where(eq(items.id, id));

  const depthOf = new Map<string, number>();
  const commentsByItem = new Map<string, DocComment[]>();
  for (const c of commentRows) {
    const depth = c.replyToId ? (depthOf.get(c.replyToId) ?? 1) + 1 : 1;
    depthOf.set(c.id, depth);
    const origin = c.fileOrigin && c.body === importedCommentBody(c.fileOrigin) ? c.fileOrigin : null;
    const doc: DocComment = origin ? { ...origin, depth } : { author: people.label.get(c.authorId) ?? null, at: dateOf(c.createdAt), text: c.body, depth };
    commentsByItem.set(c.itemId, [...(commentsByItem.get(c.itemId) ?? []), doc]);
  }
  const labelsByItem = new Map<string, string[]>(), assigneesByItem = new Map<string, string[]>();
  for (const l of labelRows) labelsByItem.set(l.itemId, [...(labelsByItem.get(l.itemId) ?? []), l.name]);
  for (const a of assigneeRows) {
    const label = people.label.get(a.userId);
    if (label) assigneesByItem.set(a.itemId, [...(assigneesByItem.get(a.itemId) ?? []), label]);
  }
  const toDoc = (r: Item): DocSubitem => {
    const extra = r.syncExtra ?? {};
    return docSubitem(r.title, {
      id: itemIds.get(r.id)!,
      done: r.done,
      status: r.done ? "DONE" : r.status === "DONE" ? null : r.status,
      priority: r.priority,
      start: r.startDate,
      due: r.dueDate,
      labels: labelsByItem.get(r.id) ?? [],
      assignees: [...(assigneesByItem.get(r.id) ?? []), ...(extra.assignees ?? [])],
      description: r.description?.trim() ? r.description : null,
      comments: commentsByItem.get(r.id) ?? [],
      attachments: extra.attachments ?? [],
      fields: extra.fields ?? {},
    });
  };
  const children = new Map<string, Item[]>();
  for (const r of rows) if (r.parentItemId) children.set(r.parentItemId, [...(children.get(r.parentItemId) ?? []), r]);
  const tops = rows.filter((r) => !r.parentItemId);
  return canonicalDoc({
    title: project.name,
    uuid: project.id,
    lists: ls.map((l) => ({ id: listIds.get(l.id)!, name: l.name, items: tops.filter((r) => r.listId === l.id).map((r): DocItem => ({ ...toDoc(r), subitems: (children.get(r.id) ?? []).map(toDoc) })) })),
  });
}

export interface ApplySummary {
  /** Items created, edited, moved or sent to the Trash */
  items: number;
  lists: number;
}

/** Make the project match `doc` (a merged document with every id set). */
export async function applyProjectDoc(tx: Tx, projectId: string, doc: ProjectDoc, actorId: string): Promise<ApplySummary> {
  const [project] = await tx.select().from(projects).where(eq(projects.id, projectId));
  if (!project) throw new Error(`Project ${projectId} not found`);
  const summary: ApplySummary = { items: 0, lists: 0 };
  const people = await projectPeople(tx, projectId);

  // ── Lists ──
  const ls = await tx.select().from(lists).where(and(eq(lists.projectId, projectId), eq(lists.kind, "project")));
  const listByExternal = new Map(ls.filter((l) => l.externalId).map((l) => [l.externalId!, l]));
  const listRowId = new Map<string, string>();
  for (const [position, l] of doc.lists.entries()) {
    const row = listByExternal.get(l.id!);
    if (row) {
      listRowId.set(l.id!, row.id);
      if (row.name !== l.name || row.position !== position) {
        await tx.update(lists).set({ name: l.name, position }).where(eq(lists.id, row.id));
        summary.lists++;
      }
    } else {
      const id = nanoid();
      const statusRole = suggestedRoleForTitle(l.name);
      await tx.insert(lists).values({ id, projectId, name: l.name, statusRole, position, externalId: l.id });
      ls.push({ id, statusRole } as (typeof ls)[number]);
      listRowId.set(l.id!, id);
      summary.lists++;
    }
  }

  // ── Items ──
  const all = await tx.select().from(items).where(eq(items.projectId, projectId));
  const live = new Set((await tx.select({ id: items.id }).from(items).where(and(eq(items.projectId, projectId), itemIsLive))).map((r) => r.id));
  // A file id can name an archived or trashed row (it comes back) — but a live row wins.
  const rowByExternal = new Map<string, Item>();
  for (const r of all) if (r.externalId && (!rowByExternal.has(r.externalId) || live.has(r.id))) rowByExternal.set(r.externalId, r);
  const projectLabels = await tx.select().from(labels).where(eq(labels.projectId, projectId));
  const labelId = new Map(projectLabels.map((l) => [l.name.toLowerCase(), l.id]));
  const placed: Array<{ doc: DocSubitem; listId: string; parentExternal: string | null; position: number }> = [];
  for (const l of doc.lists) l.items.forEach((it, i) => {
    placed.push({ doc: it, listId: listRowId.get(l.id!)!, parentExternal: null, position: i });
    it.subitems.forEach((s, j) => placed.push({ doc: s, listId: listRowId.get(l.id!)!, parentExternal: it.id, position: j }));
  });
  const newCount = placed.filter((p) => !rowByExternal.has(p.doc.id!)).length;
  let key = newCount ? await issueKeyNumbers(tx, (await groupOf(tx, projectId))!, newCount) : 0;
  const rowId = new Map<string, string>();
  for (const p of placed) {
    const row = rowByExternal.get(p.doc.id!);
    rowId.set(p.doc.id!, row?.id ?? nanoid());
  }
  const listRole = new Map(ls.map((l) => [l.id, l.statusRole]));
  // Positions are rewritten only where the order changed, so an unchanged list keeps its rows' versions.
  const container = (listId: string, parent: string | null) => (parent ? `item:${parent}` : `list:${listId}`);
  const wantOrder = new Map<string, string[]>(), haveOrder = new Map<string, string[]>();
  for (const p of placed) {
    const k = container(p.listId, p.parentExternal ? rowId.get(p.parentExternal)! : null);
    wantOrder.set(k, [...(wantOrder.get(k) ?? []), rowId.get(p.doc.id!)!]);
  }
  for (const r of [...all].filter((x) => live.has(x.id)).sort((a, b) => a.position - b.position || a.createdAt.getTime() - b.createdAt.getTime())) {
    const k = container(r.listId, r.parentItemId);
    haveOrder.set(k, [...(haveOrder.get(k) ?? []), r.id]);
  }
  const reordered = new Set([...wantOrder].filter(([k, ids]) => !sameJson(ids, haveOrder.get(k) ?? [])).map(([k]) => k));
  const keptIds = new Set<string>();
  for (const p of placed) {
    const d = p.doc;
    let touched = false;
    const id = rowId.get(d.id!)!;
    keptIds.add(id);
    const row = rowByExternal.get(d.id!);
    const parentItemId = p.parentExternal ? rowId.get(p.parentExternal)! : null;
    const unknown = d.assignees.filter((a) => !people.byName.has(nameKey(a)));
    const syncExtra: ItemSyncExtra | null = Object.keys(d.fields).length || unknown.length || d.attachments.length ? { ...(Object.keys(d.fields).length ? { fields: d.fields } : {}), ...(unknown.length ? { assignees: unknown } : {}), ...(d.attachments.length ? { attachments: d.attachments } : {}) } : null;
    const target: ItemStatus | null = d.done ? "DONE" : d.status;
    if (!row) {
      // A new item takes its list's Status role — except Done: an unticked "[ ]" in the file stays open.
      const role = listRole.get(p.listId) ?? null;
      const state = statusChange({ status: null, done: false, priorStatus: null }, target ?? (role === "DONE" ? null : role));
      await tx.insert(items).values({ id, projectId, listId: p.listId, parentItemId, title: d.title, description: d.description, ...state, priority: d.priority, startDate: d.start, dueDate: d.due, position: p.position, keyNumber: key++, externalId: d.id, syncExtra, createdBy: actorId });
      touched = true;
    } else {
      const patch: Partial<typeof items.$inferInsert> = {};
      const set = <K extends keyof typeof items.$inferInsert>(k: K, v: (typeof items.$inferInsert)[K]) => {
        if (JSON.stringify(row[k as keyof Item] ?? null) !== JSON.stringify(v ?? null)) patch[k] = v;
      };
      set("title", d.title);
      set("description", d.description);
      set("priority", d.priority);
      set("startDate", d.start);
      set("dueDate", d.due);
      if (!d.due && row.dueTime) patch.dueTime = null;
      set("listId", p.listId);
      set("parentItemId", parentItemId);
      if (reordered.has(container(p.listId, parentItemId))) set("position", p.position);
      if (!sameJson(row.syncExtra, syncExtra)) patch.syncExtra = syncExtra;
      const current: ItemStatus | null = row.done ? "DONE" : row.status;
      if (current !== target) Object.assign(patch, statusChange(row, target));
      if (row.archivedAt || row.deletedAt) Object.assign(patch, { archivedAt: null, deletedAt: null });
      if (patch.listId) patch.priorListId = null;
      if (Object.keys(patch).length) {
        await tx.update(items).set(patch).where(eq(items.id, id));
        touched = true;
      }
    }
    // Labels and assignees: exactly the document's.
    const wantLabels = new Set<string>();
    for (const name of d.labels) {
      let lid = labelId.get(name.toLowerCase());
      if (!lid) {
        lid = nanoid();
        await tx.insert(labels).values({ id: lid, projectId, name, color: LABEL_COLORS[labelId.size % LABEL_COLORS.length]!, position: labelId.size });
        labelId.set(name.toLowerCase(), lid);
      }
      wantLabels.add(lid);
    }
    const wantPeople = new Set(d.assignees.map((a) => people.byName.get(nameKey(a))).filter((x): x is string => !!x));
    const haveLabels = new Set(row ? (await tx.select({ id: itemLabels.labelId }).from(itemLabels).where(eq(itemLabels.itemId, id))).map((x) => x.id) : []);
    const havePeople = new Set(row ? (await tx.select({ id: itemAssignees.userId }).from(itemAssignees).where(eq(itemAssignees.itemId, id))).map((x) => x.id) : []);
    const addLabels = [...wantLabels].filter((v) => !haveLabels.has(v)), dropLabels = [...haveLabels].filter((v) => !wantLabels.has(v));
    const addPeople = [...wantPeople].filter((v) => !havePeople.has(v)), dropPeople = [...havePeople].filter((v) => !wantPeople.has(v));
    if (dropLabels.length) await tx.delete(itemLabels).where(and(eq(itemLabels.itemId, id), inArray(itemLabels.labelId, dropLabels)));
    if (addLabels.length) await tx.insert(itemLabels).values(addLabels.map((lid) => ({ itemId: id, labelId: lid }))).onConflictDoNothing();
    if (dropPeople.length) await tx.delete(itemAssignees).where(and(eq(itemAssignees.itemId, id), inArray(itemAssignees.userId, dropPeople)));
    if (addPeople.length) await tx.insert(itemAssignees).values(addPeople.map((userId) => ({ itemId: id, userId }))).onConflictDoNothing();
    const changedSets = addLabels.length + dropLabels.length + addPeople.length + dropPeople.length;
    // Comments: add the document's new ones (as the file wrote them), remove the ones it dropped.
    const have = row ? await tx.select().from(comments).where(eq(comments.itemId, id)).orderBy(asc(comments.createdAt)) : [];
    const keyOf = (c: Pick<DocComment, "author" | "at" | "text">) => JSON.stringify([c.author ?? null, c.at ?? null, c.text]);
    const haveKeys = new Map(have.map((c) => [c.fileOrigin && c.body === importedCommentBody(c.fileOrigin) ? keyOf(c.fileOrigin) : keyOf({ author: people.label.get(c.authorId) ?? null, at: dateOf(c.createdAt), text: c.body }), c]));
    const wantKeys = new Set(d.comments.map(keyOf));
    const gone = have.filter((c) => ![...wantKeys].some((k) => haveKeys.get(k) === c));
    if (gone.length) await tx.delete(comments).where(inArray(comments.id, gone.map((c) => c.id)));
    const thread: Array<{ id: string; depth: number }> = [];
    let at = Date.now();
    let added = 0;
    for (const c of d.comments) {
      const existing = haveKeys.get(keyOf(c));
      while (thread.length && thread[thread.length - 1]!.depth >= c.depth) thread.pop();
      const cid = existing?.id ?? nanoid();
      if (!existing) {
        const origin: DocComment = { author: c.author, at: c.at, text: c.text, depth: c.depth };
        await tx.insert(comments).values({ id: cid, itemId: id, authorId: actorId, body: importedCommentBody(origin), fileOrigin: origin, replyToId: thread[thread.length - 1]?.id ?? null, createdAt: new Date(at++) });
        added++;
      }
      thread.push({ id: cid, depth: c.depth });
    }
    if (touched || changedSets || gone.length || added) summary.items++;
  }

  // ── What the document dropped: live items to the Trash, emptied lists removed ──
  // A subitem goes with its dropped parent (restoring the parent brings it back), so only the rest are marked.
  const parentOf = new Map(all.map((r) => [r.id, r.parentItemId]));
  const dropped = [...live].filter((id) => !keptIds.has(id) && !(parentOf.get(id) && !keptIds.has(parentOf.get(id)!)));
  if (dropped.length) {
    await tx.update(items).set({ deletedAt: new Date() }).where(and(inArray(items.id, dropped), isNull(items.deletedAt)));
    summary.items += dropped.length;
  }
  const keptLists = new Set(listRowId.values());
  const goneLists = ls.filter((l) => !keptLists.has(l.id));
  const fallback = doc.lists[0] ? listRowId.get(doc.lists[0].id!) : undefined;
  for (const l of goneLists) {
    if (!fallback) break;
    // Archived and trashed items still point at the list: they move to the first list, so restoring them works.
    await tx.update(items).set({ listId: fallback }).where(eq(items.listId, l.id));
    await tx.delete(lists).where(eq(lists.id, l.id));
    summary.lists++;
  }
  if (summary.items || summary.lists) {
    await logActivity(tx, { projectId, actorId, type: "settings", text: `synced with GitHub: ${summary.items} item${summary.items === 1 ? "" : "s"} and ${summary.lists} list${summary.lists === 1 ? "" : "s"} changed` });
  }
  return summary;
}

async function groupOf(tx: Tx, projectId: string) {
  const [p] = await tx.select({ groupId: projects.groupId }).from(projects).where(eq(projects.id, projectId));
  return p?.groupId;
}

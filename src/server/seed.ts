// Development seed: the UI kit's sample workspace (docs/design/kit-walkthrough.md) so every view has
// realistic data from the first run. The skeleton (groups, projects, lists) is created only while the
// database has no groups; the examples themselves (items, comments, photos, Flo's Inbox) are filled in
// on every start, so a database seeded by an older version catches up without a reset.
import { and, count, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { nanoid } from "nanoid";
import { readFile } from "node:fs/promises";

import type { ItemPriority, LabelColor, NotificationKind } from "../shared/enums";
import type { ItemStatus } from "../shared/item-status";
import { DEV_USER } from "../shared/devUser";
import { DEV_PASSWORD, inboxFor, LOCAL_USER_ID } from "./auth";
import { hashPassword } from "better-auth/crypto";
import { db } from "./db";
import { accounts, attachments, comments, groups, itemAssignees, itemLabels, itemRelations, items, labels, lists, members, projects, users, type Project } from "./db/schema";
import { createProject } from "./services/projects";
import { saveUpload } from "./services/uploads";

const SAM_ID = "seed_user_sam_000000a";
const FLO = "seed_user_flo_000000a";
const SAM = SAM_ID;
const MAIN = "Helicopters Europe website";
const MAIN_DESCRIPTION = "The shop and the public pages for both dealers. Sam takes the shop side, Flo takes the pages.";

interface SeedItem {
  project: string;
  key: number;
  list: string;
  title: string;
  labels?: string[];
  due?: string;
  start?: string;
  priority?: ItemPriority;
  assignees?: string[];
  description?: string;
  done?: boolean;
  created: string;
  subitems?: Array<{ key: number; title: string; done?: boolean }>;
  cover?: string;
  repeat?: { freq: "weekly"; byWeekday: number[]; ends: { type: "after"; count: number } };
  repeatCount?: number;
  /** Photos from src/server/seed-assets, attached to the item; the first one becomes its cover */
  photos?: string[];
  comments?: Array<[author: string, body: string]>;
}

interface SeedInboxItem {
  title: string;
  created: string;
  unread?: boolean;
  description?: string;
  /** A notification: who it came from (null = Todoi itself) and which main-project key it is about */
  kind?: NotificationKind;
  from?: string | null;
  about?: number;
  subitems?: string[];
}

const SAMPLE_GROUPS: Array<[name: string, keyPrefix: string]> = [["Marketing & PR", "MP"], ["Sales", "SAL"]];
const SAMPLE_PROJECTS: Array<{ group: string; name: string; icon: string; color: LabelColor; visibility?: "shared"; lists: Array<[string, ItemStatus | null]> }> = [
  { group: "Marketing & PR", name: MAIN, icon: "globe", color: "orange", visibility: "shared", lists: [["New", "NEW"], ["To-do", "TODO"], ["Doing", "DOING"], ["Done", "DONE"], ["Backlog", "BACKLOG"]] },
  { group: "Marketing & PR", name: "Social Media", icon: "megaphone", color: "pink", lists: [["Ideas", "NEW"], ["Planned", "TODO"], ["Posted", "DONE"]] },
  { group: "Sales", name: "Dealers & stock", icon: "package", color: "blue", lists: [["Incoming", "NEW"], ["To-do", "TODO"], ["Doing", "DOING"], ["Done", "DONE"]] },
  { group: "Sales", name: "Spare parts", icon: "wrench", color: "lime", lists: [["To-do", "TODO"], ["Doing", "DOING"], ["Done", "DONE"]] },
  { group: "Sales", name: "Trade show 2027", icon: "tent", color: "teal", lists: [] },
];
const SAMPLE_PROJECT_NAMES = SAMPLE_PROJECTS.map((p) => p.name);
const PROJECT_LABELS: Record<string, Array<[name: string, color: string]>> = {
  [MAIN]: [["note", "teal"], ["shop", "blue"], ["design", "pink"], ["photos", "orange"], ["broken", "red"], ["paperwork", "lime"]],
  "Social Media": [["design", "pink"]],
};

// Helicopters Europe website (group Marketing & PR, prefix MP) — the kit's main project — plus the
// one item each of the other projects (the kit keeps those in a single list; here they go in the
// matching list of the fuller templates).
const SAMPLE_ITEMS: SeedItem[] = [
  { project: MAIN, key: 102, list: "New", title: "Marit from Bergen asked twice now if we ship the two-seaters to Norway, so put shipping info on the site.", labels: ["note", "shop"], priority: "MEDIUM", assignees: [FLO], created: "2026-07-03" },
  { project: MAIN, key: 121, list: "New", title: "Write the copy for the used helicopters page", description: "Sam takes it if nobody else has started by Friday.", due: "2026-09-03", assignees: [SAM], created: "2026-08-19" },
  { project: MAIN, key: 124, list: "New", title: "Do we need a phone number on every page?", created: "2026-08-21" },
  { project: MAIN, key: 103, list: "To-do", title: "Build the product page for a single helicopter: photos, price, specs, big buy button.", labels: ["note", "shop"], due: "2026-09-05", start: "2026-08-20", priority: "URGENT", assignees: [SAM, FLO], created: "2026-07-03", subitems: [{ key: 111, title: "Spec table from the dealer sheets", done: true }, { key: 113, title: "Photo gallery with zoom" }, { key: 114, title: "Price block with the big buy button" }] },
  { project: MAIN, key: 131, list: "To-do", title: "Sketch the homepage banner", labels: ["design"], due: "2026-08-28", assignees: [FLO], created: "2026-08-04" },
  { project: MAIN, key: 119, list: "To-do", title: "Write the order confirmation email", due: "2026-09-01", priority: "MEDIUM", assignees: [SAM], created: "2026-08-06" },
  { project: MAIN, key: 127, list: "To-do", title: "Delivery and pickup options", due: "2029-02-16", priority: "HIGH", created: "2026-08-11" },
  { project: MAIN, key: 104, list: "To-do", title: "Homepage layout: three helicopters up front, everything else below.", labels: ["note"], priority: "HIGH", assignees: [FLO], created: "2026-07-03", cover: "webshop-home" },
  { project: MAIN, key: 115, list: "To-do", title: "Collect photos from the two dealers", labels: ["photos"], due: "2026-08-27", assignees: [FLO], created: "2026-08-13", photos: ["yellow-helicopter.png", "orange-helicopter.png", "grey-helicopter.png"] },
  { project: MAIN, key: 133, list: "To-do", title: "Professional typography for the prices", due: "2026-09-09", priority: "LOW", created: "2026-08-17" },
  { project: MAIN, key: 137, list: "To-do", title: "Check both dealers' stock lists for changes", due: "2026-08-27", assignees: [SAM], created: "2026-08-06", repeat: { freq: "weekly", byWeekday: [4], ends: { type: "after", count: 10 } }, repeatCount: 2 },
  { project: MAIN, key: 105, list: "Doing", title: "Shopping cart works, but you can still add three helicopters at once.", labels: ["note", "shop"], due: "2026-08-26", priority: "HIGH", assignees: [SAM], created: "2026-07-03" },
  { project: MAIN, key: 129, list: "Doing", title: "Ask a lawyer what we're allowed to sell online", due: "2026-08-18", start: "2026-08-10", priority: "HIGH", assignees: [SAM], created: "2026-07-28" },
  { project: MAIN, key: 112, list: "Doing", title: "Pricing page: do we show the price or only “request a quote”?", labels: ["note"], start: "2026-07-21", priority: "MEDIUM", assignees: [FLO], created: "2026-07-03", cover: "webshop-quote", comments: [[SAM, "Both dealers want the price hidden on the new models."], [FLO, "Fine, but used ones get a real price tag."]] },
  { project: MAIN, key: 126, list: "Doing", title: "Cut the helicopter photos to the right sizes", labels: ["design"], description: "One wide shot for the banner, one square for the list.", due: "2026-08-29", start: "2026-08-17", priority: "MEDIUM", assignees: [FLO], created: "2026-08-02", subitems: [{ key: 116, title: "Wide banner crop", done: true }, { key: 117, title: "Square list crop" }, { key: 118, title: "Compress everything to under 300 KB" }] },
  { project: MAIN, key: 108, list: "Done", title: "Settled on the name: Helicopters Europe", done: true, due: "2020-01-10", assignees: [FLO], created: "2026-06-30" },
  { project: MAIN, key: 110, list: "Done", title: "Bought the domain", done: true, due: "2019-12-18", assignees: [SAM], created: "2026-06-24" },
  { project: MAIN, key: 106, list: "Backlog", title: "Sort out what the labels mean before we both invent our own", labels: ["photos", "broken", "design", "shop", "paperwork"], description: "Two people, five labels. Anything more and we'll stop using them.", priority: "LOW", assignees: [FLO], created: "2026-07-03" },
  { project: MAIN, key: 101, list: "Backlog", title: "Helicopters Europe launch plan", due: "2026-09-18", priority: "HIGH", assignees: [SAM, FLO], description: "Everything that has to be finished before the shop goes live. Sam takes the shop side, Flo takes the pages.", created: "2026-07-05", subitems: [{ key: 120, title: "Get the helicopter list and prices from both dealers", done: true }, { key: 122, title: "Decide which models we sell online", done: true }, { key: 123, title: "Finish the checkout flow" }, { key: 125, title: "Photos for all twelve helicopters" }, { key: 128, title: "Test a full order end to end" }, { key: 130, title: "Go live" }] },
  { project: MAIN, key: 135, list: "Backlog", title: "Financing calculator", priority: "LOW", created: "2026-08-10" },
  { project: MAIN, key: 136, list: "Backlog", title: "Spare parts shop, later", priority: "LOW", created: "2026-08-12" },
  { project: "Social Media", key: 205, list: "Planned", title: "Announce the shop on the day it goes live", labels: ["design"], assignees: [FLO], created: "2026-08-20" },
  { project: "Dealers & stock", key: 201, list: "Incoming", title: "Get the current stock list from the Antwerp dealer", priority: "HIGH", assignees: [SAM], created: "2026-08-19" },
  { project: "Spare parts", key: 202, list: "To-do", title: "Find tail rotor blades for the 2009 R44", assignees: [FLO], created: "2026-08-22" },
];

// Flo's Inbox as the kit shows it: notifications about the main project and two loose items.
const INBOX: SeedInboxItem[] = [
  { kind: "mention", from: SAM, about: 112, title: "Sam Verhoeven mentioned you on MP-112: Pricing page: do we show the price", created: "2026-08-25", unread: true, description: "> @Flo both dealers want the price hidden on the new models — fine with you before I change the copy?" },
  { kind: "assignment", from: SAM, about: 126, title: "Sam Verhoeven assigned MP-126 to you: Cut the helicopter photos to the right sizes", created: "2026-08-25", unread: true },
  { kind: "sync", from: null, about: 112, title: "Sync conflict on MP-112 — changed in Todoi and on GitHub", created: "2026-08-24", unread: true, description: "The title and due date differ between the two copies. Keep one version in Settings › Storage & sync; nothing syncs for this project until you do." },
  { title: "Call the insurance broker back about hull coverage", created: "2026-08-24" },
  { kind: "watch", from: SAM, about: 108, title: "Sam Verhoeven moved MP-108 to Done: Settled on the name: Helicopters Europe", created: "2026-08-23" },
  { title: "Idea: trade-in program for older helicopters", created: "2026-08-21", subitems: ["Ask both dealers if they'd take trade-ins", "Check what a trade-in is worth"] },
  { kind: "news", from: null, title: "Todoi 2.1 is out: drag items between lists, sort menus, and calendar rescheduling", created: "2026-08-18", unread: true },
];

const hasAny = async (table: typeof attachments | typeof comments, where: SQL) => ((await db.select({ n: count() }).from(table).where(where))[0]?.n ?? 0) > 0;
const at = (day: string, minutes = 0) => new Date(new Date(day + "T09:00:00Z").getTime() + minutes * 60_000);

export async function seedIfEmpty() {
  const flo = await ensureDevAccounts();
  await assignExistingSamples(flo);
  const fresh = ((await db.select({ n: count() }).from(groups))[0]?.n ?? 0) === 0;
  if (fresh) await createSkeleton(flo);
  // An earlier seed stored the sample cover's name under `color`; move it to `sample`.
  else await db.execute(sql`update items set cover = jsonb_build_object('sample', cover->>'color') where cover->>'color' like 'web%'`);
  await fillSamples(flo);
  return fresh;
}

/** The groups, projects and lists of the sample workspace, owned by Flo; Sam edits the main project. */
async function createSkeleton(flo: string) {
  const groupIds = new Map<string, string>();
  await db.insert(groups).values(
    SAMPLE_GROUPS.map(([name, keyPrefix], position) => {
      const id = nanoid();
      groupIds.set(name, id);
      return { id, name, keyPrefix, ownerId: flo, position };
    }),
  );
  for (const p of SAMPLE_PROJECTS) {
    const { project } = await createProject({ id: nanoid(), groupId: groupIds.get(p.group)!, name: p.name, icon: p.icon, color: p.color, visibility: p.visibility, lists: p.lists }, flo);
    if (p.name === MAIN) await db.insert(members).values({ projectId: project.id, userId: SAM, role: "editor" });
  }
  console.log("Seeded the sample workspace (Helicopters Europe website)");
}

/** Everything the kit shows inside the sample projects, inserted where it is missing (matched by key / title). */
async function fillSamples(flo: string) {
  const sampleGroups = await db
    .select({ id: groups.id, name: groups.name, keyPrefix: groups.keyPrefix })
    .from(groups)
    .where(and(eq(groups.ownerId, flo), inArray(groups.name, SAMPLE_GROUPS.map(([name]) => name)), isNull(groups.deletedAt)));
  if (!sampleGroups.length) return;
  const sampleProjects = await db
    .select()
    .from(projects)
    .where(and(inArray(projects.groupId, sampleGroups.map((g) => g.id)), inArray(projects.name, SAMPLE_PROJECT_NAMES), isNull(projects.deletedAt)));
  const projectIds = sampleProjects.map((p) => p.id);
  const byName = new Map(sampleProjects.map((p) => [p.name, p]));
  const main = byName.get(MAIN);
  if (!main) return;
  let added = 0;
  if (!main.description) await db.update(projects).set({ description: MAIN_DESCRIPTION }).where(eq(projects.id, main.id));

  for (const [name, defs] of Object.entries(PROJECT_LABELS)) {
    const p = byName.get(name);
    if (p) await db.insert(labels).values(defs.map(([label, color], position) => ({ id: nanoid(), projectId: p.id, name: label, color, position }))).onConflictDoNothing();
  }
  const labelRows = await db.select().from(labels).where(inArray(labels.projectId, projectIds));
  const listRows = await db.select().from(lists).where(inArray(lists.projectId, projectIds)).orderBy(lists.position);
  const existing = await db
    .select({ id: items.id, projectId: items.projectId, keyNumber: items.keyNumber, cover: items.cover })
    .from(items)
    .where(and(inArray(items.projectId, projectIds), isNull(items.parentItemId)));
  const keyed = new Map(existing.map((i) => [`${i.projectId}:${i.keyNumber}`, i]));

  for (const it of SAMPLE_ITEMS) {
    const project = byName.get(it.project);
    if (!project) continue;
    let row = keyed.get(`${project.id}:${it.key}`);
    if (!row) {
      const list = listRows.find((l) => l.projectId === project.id && l.name === it.list) ?? listRows.find((l) => l.projectId === project.id);
      if (!list) continue;
      row = await insertSampleItem(project, list, it, labelRows, flo);
      keyed.set(`${project.id}:${it.key}`, row);
      added++;
    }
    if (it.photos) added += await ensurePhotos(row, it.photos, flo);
    if (it.comments) added += await ensureComments(row.id, it.comments, flo);
  }
  // Keys are issued from the group counter; keep it above every seeded key.
  for (const group of sampleGroups) {
    const keys = SAMPLE_ITEMS.filter((it) => byName.get(it.project)?.groupId === group.id).flatMap((it) => [it.key, ...(it.subitems ?? []).map((s) => s.key)]);
    if (keys.length) await db.update(groups).set({ nextItemNumber: sql`greatest(${groups.nextItemNumber}, ${Math.max(...keys) + 1})` }).where(eq(groups.id, group.id));
  }
  const mainGroup = sampleGroups.find((g) => g.id === main.groupId)!;
  added += await ensureInbox(flo, (key) => {
    const about = keyed.get(`${main.id}:${key}`);
    return about ? { aboutKey: `${mainGroup.keyPrefix}-${key}`, aboutItemId: about.id } : {};
  });
  if (added) console.log(`Seeded ${added} sample records for ${DEV_USER.email}`);
}

async function insertSampleItem(project: Project, list: typeof lists.$inferSelect, it: SeedItem, labelRows: Array<typeof labels.$inferSelect>, flo: string) {
  const position = ((await db.select({ max: sql<number>`coalesce(max(${items.position}), -1)` }).from(items).where(eq(items.listId, list.id)))[0]?.max ?? -1) + 1;
  const id = nanoid();
  const cover = it.cover ? { sample: it.cover } : null;
  await db.insert(items).values({
    id,
    projectId: project.id,
    listId: list.id,
    keyNumber: it.key,
    title: it.title,
    description: it.description ?? null,
    status: it.done ? "DONE" : list.statusRole,
    done: !!it.done,
    priority: it.priority ?? null,
    startDate: it.start ?? null,
    dueDate: it.due ?? null,
    repeatRule: it.repeat ?? null,
    repeatCount: it.repeatCount ?? 0,
    cover,
    position,
    createdBy: flo,
    createdAt: at(it.created),
  });
  const labelIds = (it.labels ?? []).flatMap((name) => labelRows.filter((l) => l.projectId === project.id && l.name === name).map((l) => l.id));
  if (labelIds.length) await db.insert(itemLabels).values(labelIds.map((labelId) => ({ itemId: id, labelId })));
  if (it.assignees?.length) await db.insert(itemAssignees).values(it.assignees.map((userId) => ({ itemId: id, userId: userId === FLO ? flo : userId })));
  if (it.subitems?.length) {
    await db.insert(items).values(
      it.subitems.map((s, i) => ({ id: nanoid(), projectId: project.id, listId: list.id, parentItemId: id, keyNumber: s.key, title: s.title, done: !!s.done, status: s.done ? ("DONE" as const) : null, position: i, createdBy: flo })),
    );
  }
  return { id, projectId: project.id, keyNumber: it.key, cover };
}

/** The kit's helicopter photos as real attachments (bytes under UPLOAD_DIR); the first becomes the cover. */
async function ensurePhotos(item: { id: string; cover: { attachmentId?: string } | null }, files: string[], flo: string) {
  if (await hasAny(attachments, eq(attachments.itemId, item.id))) return 0;
  const made: string[] = [];
  for (const name of files) {
    const bytes = await readFile(new URL(`./seed-assets/${name}`, import.meta.url));
    const storageKey = await saveUpload(bytes);
    const [row] = await db.insert(attachments).values({ id: nanoid(), itemId: item.id, name, size: bytes.byteLength, mime: "image/png", storageKey, uploadedBy: flo }).returning({ id: attachments.id });
    made.push(row!.id);
  }
  if (!item.cover && made[0]) await db.update(items).set({ cover: { attachmentId: made[0] } }).where(eq(items.id, item.id));
  return made.length;
}

async function ensureComments(itemId: string, list: SeedItem["comments"] & {}, flo: string) {
  if (await hasAny(comments, eq(comments.itemId, itemId))) return 0;
  await db.insert(comments).values(list.map(([author, body], i) => ({ id: nanoid(), itemId, authorId: author === FLO ? flo : author, body, createdAt: at("2026-08-25", i * 7) })));
  return list.length;
}

/** Flo's account-level Inbox: notifications link back ("related") to the item they are about. */
async function ensureInbox(flo: string, aboutOf: (key: number) => { aboutKey?: string; aboutItemId?: string }) {
  const listId = await inboxFor(flo);
  const present = new Set((await db.select({ title: items.title }).from(items).where(eq(items.listId, listId))).map((r) => r.title));
  let position = ((await db.select({ max: sql<number>`coalesce(max(${items.position}), -1)` }).from(items).where(eq(items.listId, listId)))[0]?.max ?? -1) + 1;
  let added = 0;
  for (const it of INBOX) {
    if (present.has(it.title)) continue;
    const id = nanoid();
    const about = it.about == null ? {} : aboutOf(it.about);
    await db.insert(items).values({
      id,
      listId,
      title: it.title,
      description: it.description ?? null,
      unread: !!it.unread,
      notification: it.kind ? { kind: it.kind, fromUserId: it.from ?? null, ...about } : null,
      position: position++,
      createdBy: it.from ?? flo,
      createdAt: at(it.created),
    });
    if (about.aboutItemId) await db.insert(itemRelations).values({ itemId: id, targetId: about.aboutItemId, type: "related" }).onConflictDoNothing();
    if (it.subitems?.length) await db.insert(items).values(it.subitems.map((title, i) => ({ id: nanoid(), listId, parentItemId: id, title, position: i, createdBy: flo, createdAt: at(it.created) })));
    added++;
  }
  return added;
}

/** Email + password sign-in for the seed people (development only): the password is DEV_PASSWORD. */
async function ensureDevAccounts() {
  await db.insert(users).values([
    { id: FLO, name: "Flo Zuallaert", email: DEV_USER.email, emailVerified: true, nickname: "flo", avatarColor: "blue" },
    { id: SAM, name: "Sam Verhoeven", email: "sam@helicopterseurope.com", emailVerified: true, nickname: "sam", avatarColor: "orange" },
  ]).onConflictDoNothing();
  const [flo] = await db.select({ id: users.id }).from(users).where(eq(users.email, DEV_USER.email));
  if (!flo) throw new Error("Could not create the sample account");
  await db.update(users).set({ emailVerified: true }).where(eq(users.id, flo.id));
  const people = await db.select({ id: users.id }).from(users).where(inArray(users.id, [LOCAL_USER_ID, flo.id, SAM_ID]));
  for (const { id: userId } of people) {
    const [acc] = await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")));
    if (acc) continue;
    await db.insert(accounts).values({ id: nanoid(), userId, accountId: userId, providerId: "credential", password: await hashPassword(DEV_PASSWORD) });
  }
  return flo.id;
}

/** Move the original kit examples to Flo's registered account without copying projects or items. */
async function assignExistingSamples(flo: string) {
  await db.transaction(async (tx) => {
    const legacyGroups = await tx.select({ id: groups.id }).from(groups).where(and(eq(groups.ownerId, LOCAL_USER_ID), inArray(groups.name, SAMPLE_GROUPS.map(([name]) => name))));
    if (!legacyGroups.length) return;
    const groupIds = legacyGroups.map((g) => g.id);
    const sampleProjects = await tx.select({ id: projects.id }).from(projects).where(and(inArray(projects.groupId, groupIds), inArray(projects.name, SAMPLE_PROJECT_NAMES)));
    const projectIds = sampleProjects.map((p) => p.id);
    await tx.update(groups).set({ ownerId: flo }).where(inArray(groups.id, groupIds));
    if (!projectIds.length) return;
    await tx.insert(members).values(projectIds.map((projectId) => ({ projectId, userId: flo, role: "owner" as const }))).onConflictDoUpdate({ target: [members.projectId, members.userId], set: { role: "owner" } });
    await tx.delete(members).where(and(inArray(members.projectId, projectIds), eq(members.userId, LOCAL_USER_ID)));
    await tx.update(items).set({ createdBy: flo }).where(and(inArray(items.projectId, projectIds), eq(items.createdBy, LOCAL_USER_ID)));
    const sampleItems = tx.select({ id: items.id }).from(items).where(inArray(items.projectId, projectIds));
    await tx.insert(itemAssignees).select(tx.select({ itemId: itemAssignees.itemId, userId: sql<string>`${flo}`.as("user_id") }).from(itemAssignees).where(and(inArray(itemAssignees.itemId, sampleItems), eq(itemAssignees.userId, LOCAL_USER_ID)))).onConflictDoNothing();
    await tx.delete(itemAssignees).where(and(inArray(itemAssignees.itemId, sampleItems), eq(itemAssignees.userId, LOCAL_USER_ID)));
  });
}

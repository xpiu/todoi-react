// Development seed: the UI kit's sample workspace (docs/design/kit-walkthrough.md) so every view has
// realistic data from the first run. Idempotent: runs only while the database has no groups.
import { and, count, inArray, sql, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import type { ItemPriority } from "../shared/enums";
import type { ItemStatus } from "../shared/item-status";
import { DEV_USER } from "../shared/devUser";
import { DEV_PASSWORD, LOCAL_USER_ID } from "./auth";
import { hashPassword } from "better-auth/crypto";
import { db } from "./db";
import { accounts, groups, itemAssignees, itemLabels, items, labels, members, projects, users } from "./db/schema";
import { createProject } from "./services/projects";

const SAM_ID = "seed_user_sam_000000a";

interface SeedItem {
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
}

const FLO = "seed_user_flo_000000a";
const SAM = SAM_ID;
const SAMPLE_PROJECT_NAMES = ["Helicopters Europe website", "Social Media", "Dealers & stock", "Spare parts", "Trade show 2027"];

// Helicopters Europe website (group Marketing & PR, prefix MP) — the kit's main project.
const HELICOPTERS: SeedItem[] = [
  { key: 102, list: "New", title: "Marit from Bergen asked twice now if we ship the two-seaters to Norway, so put shipping info on the site.", labels: ["note", "shop"], priority: "MEDIUM", assignees: [FLO], created: "2026-07-03" },
  { key: 121, list: "New", title: "Write the copy for the used helicopters page", description: "Sam takes it if nobody else has started by Friday.", due: "2026-09-03", assignees: [SAM], created: "2026-08-19" },
  { key: 124, list: "New", title: "Do we need a phone number on every page?", created: "2026-08-21" },
  { key: 103, list: "To-do", title: "Build the product page for a single helicopter: photos, price, specs, big buy button.", labels: ["note", "shop"], due: "2026-09-05", start: "2026-08-20", priority: "URGENT", assignees: [SAM, FLO], created: "2026-07-03", subitems: [{ key: 111, title: "Spec table from the dealer sheets", done: true }, { key: 113, title: "Photo gallery with zoom" }, { key: 114, title: "Price block with the big buy button" }] },
  { key: 131, list: "To-do", title: "Sketch the homepage banner", labels: ["design"], due: "2026-08-28", assignees: [FLO], created: "2026-08-04" },
  { key: 119, list: "To-do", title: "Write the order confirmation email", due: "2026-09-01", priority: "MEDIUM", assignees: [SAM], created: "2026-08-06" },
  { key: 127, list: "To-do", title: "Delivery and pickup options", due: "2029-02-16", priority: "HIGH", created: "2026-08-11" },
  { key: 104, list: "To-do", title: "Homepage layout: three helicopters up front, everything else below.", labels: ["note"], priority: "HIGH", assignees: [FLO], created: "2026-07-03", cover: "webshop-home" },
  { key: 115, list: "To-do", title: "Collect photos from the two dealers", labels: ["photos"], due: "2026-08-27", assignees: [FLO], created: "2026-08-13" },
  { key: 133, list: "To-do", title: "Professional typography for the prices", due: "2026-09-09", priority: "LOW", created: "2026-08-17" },
  { key: 137, list: "To-do", title: "Check both dealers' stock lists for changes", due: "2026-08-27", assignees: [SAM], created: "2026-08-06", repeat: { freq: "weekly", byWeekday: [4], ends: { type: "after", count: 10 } }, repeatCount: 2 },
  { key: 105, list: "Doing", title: "Shopping cart works, but you can still add three helicopters at once.", labels: ["note", "shop"], due: "2026-08-26", priority: "HIGH", assignees: [SAM], created: "2026-07-03" },
  { key: 129, list: "Doing", title: "Ask a lawyer what we're allowed to sell online", due: "2026-08-18", start: "2026-08-10", priority: "HIGH", assignees: [SAM], created: "2026-07-28" },
  { key: 112, list: "Doing", title: "Pricing page: do we show the price or only “request a quote”?", labels: ["note"], start: "2026-07-21", priority: "MEDIUM", assignees: [FLO], created: "2026-07-03", cover: "webshop-quote" },
  { key: 126, list: "Doing", title: "Cut the helicopter photos to the right sizes", labels: ["design"], description: "One wide shot for the banner, one square for the list.", due: "2026-08-29", start: "2026-08-17", priority: "MEDIUM", assignees: [FLO], created: "2026-08-02", subitems: [{ key: 116, title: "Wide banner crop", done: true }, { key: 117, title: "Square list crop" }, { key: 118, title: "Compress everything to under 300 KB" }] },
  { key: 108, list: "Done", title: "Settled on the name: Helicopters Europe", done: true, due: "2020-01-10", start: "2026-06-28", assignees: [FLO], created: "2026-06-30" },
  { key: 110, list: "Done", title: "Bought the domain", done: true, due: "2019-12-18", start: "2026-06-20", assignees: [SAM], created: "2026-06-24" },
  { key: 106, list: "Backlog", title: "Sort out what the labels mean before we both invent our own", labels: ["photos", "broken", "design", "shop", "paperwork"], description: "Two people, five labels. Anything more and we'll stop using them.", priority: "LOW", assignees: [FLO], created: "2026-07-03" },
  { key: 101, list: "Backlog", title: "Helicopters Europe launch plan", due: "2026-09-18", priority: "HIGH", assignees: [SAM, FLO], description: "Everything that has to be finished before the shop goes live. Sam takes the shop side, Flo takes the pages.", created: "2026-07-05", subitems: [{ key: 120, title: "Get the helicopter list and prices from both dealers", done: true }, { key: 122, title: "Decide which models we sell online", done: true }, { key: 123, title: "Finish the checkout flow" }, { key: 125, title: "Photos for all twelve helicopters" }, { key: 128, title: "Test a full order end to end" }, { key: 130, title: "Go live" }] },
  { key: 135, list: "Backlog", title: "Financing calculator", priority: "LOW", created: "2026-08-10" },
  { key: 136, list: "Backlog", title: "Spare parts shop, later", priority: "LOW", created: "2026-08-12" },
];

const LABELS: Array<[name: string, color: string]> = [["note", "teal"], ["shop", "blue"], ["design", "pink"], ["photos", "orange"], ["broken", "red"], ["paperwork", "lime"]];
const LIST_ROLES: Array<[string, ItemStatus | null]> = [["New", "NEW"], ["To-do", "TODO"], ["Doing", "DOING"], ["Done", "DONE"], ["Backlog", "BACKLOG"]];

export async function seedIfEmpty() {
  const flo = await ensureDevAccounts();
  await assignExistingSamples(flo);
  const existing = (await db.select({ n: count() }).from(groups))[0]?.n ?? 0;
  if (existing > 0) {
    // An earlier seed stored the sample cover's name under `color`; move it to `sample`.
    await db.execute(sql`update items set cover = jsonb_build_object('sample', cover->>'color') where cover->>'color' like 'web%'`);
    return false;
  }
  const marketing = nanoid();
  const sales = nanoid();
  await db.insert(groups).values([
    { id: marketing, name: "Marketing & PR", keyPrefix: "MP", nextItemNumber: 140, ownerId: flo, position: 0 },
    { id: sales, name: "Sales", keyPrefix: "SAL", ownerId: flo, position: 1 },
  ]);

  const main = await createProject({ id: nanoid(), groupId: marketing, name: "Helicopters Europe website", icon: "globe", color: "orange", visibility: "shared", lists: LIST_ROLES }, flo);
  await db.insert(members).values({ projectId: main.project.id, userId: SAM, role: "editor" });
  await createProject({ id: nanoid(), groupId: marketing, name: "Social Media", icon: "megaphone", color: "pink", lists: [["Ideas", "NEW"], ["Planned", "TODO"], ["Posted", "DONE"]] }, flo);
  await createProject({ id: nanoid(), groupId: sales, name: "Dealers & stock", icon: "package", color: "blue", lists: [["Incoming", "NEW"], ["To-do", "TODO"], ["Doing", "DOING"], ["Done", "DONE"]] }, flo);
  await createProject({ id: nanoid(), groupId: sales, name: "Spare parts", icon: "wrench", color: "lime", lists: [["To-do", "TODO"], ["Doing", "DOING"], ["Done", "DONE"]] }, flo);
  await createProject({ id: nanoid(), groupId: sales, name: "Trade show 2027", icon: "tent", color: "teal", lists: [] }, flo);

  const labelIds = new Map<string, string>();
  const labelRows = await db
    .insert(labels)
    .values(LABELS.map(([name, color], i) => ({ id: nanoid(), projectId: main.project.id, name, color, position: i })))
    .returning();
  for (const l of labelRows) labelIds.set(l.name, l.id);
  const listIds = new Map(main.lists.map((l) => [l.name, l.id]));

  const perList = new Map<string, number>();
  for (const it of HELICOPTERS) {
    const listId = listIds.get(it.list)!;
    const position = perList.get(listId) ?? 0;
    perList.set(listId, position + 1);
    const role = LIST_ROLES.find(([n]) => n === it.list)?.[1] ?? null;
    const id = nanoid();
    await db.insert(items).values({
      id,
      projectId: main.project.id,
      listId,
      keyNumber: it.key,
      title: it.title,
      description: it.description ?? null,
      status: it.done ? "DONE" : role,
      done: !!it.done,
      priority: it.priority ?? null,
      startDate: it.start ?? null,
      dueDate: it.due ?? null,
      repeatRule: it.repeat ?? null,
      repeatCount: it.repeatCount ?? 0,
      cover: it.cover ? { sample: it.cover } : null,
      position,
      createdBy: flo,
      createdAt: new Date(it.created + "T09:00:00Z"),
    });
    if (it.labels?.length) await db.insert(itemLabels).values(it.labels.map((name) => ({ itemId: id, labelId: labelIds.get(name)! })));
    if (it.assignees?.length) await db.insert(itemAssignees).values(it.assignees.map((userId) => ({ itemId: id, userId: userId === FLO ? flo : userId })));
    if (it.subitems?.length) {
      await db.insert(items).values(
        it.subitems.map((s, i) => ({ id: nanoid(), projectId: main.project.id, listId, parentItemId: id, keyNumber: s.key, title: s.title, done: !!s.done, status: s.done ? ("DONE" as const) : null, position: i, createdBy: flo })),
      );
    }
  }
  console.log("Seeded the sample workspace (Helicopters Europe website)");
  return true;
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
    const legacyGroups = await tx.select({ id: groups.id }).from(groups).where(and(eq(groups.ownerId, LOCAL_USER_ID), inArray(groups.name, ["Marketing & PR", "Sales"])));
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

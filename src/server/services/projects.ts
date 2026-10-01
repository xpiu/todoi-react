// Group / project / list behaviours shared by the routes and the seed. Spec: DESIGN.md › Project lifecycle,
// Lists & Status linking.
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { LABEL_COLORS } from "../../shared/enums";
import type { ImportProjectInput } from "../../shared/import";
import type { CreateProjectInput, UpdateListInput } from "../../shared/projects";
import { db } from "../db";
import { groups, itemLabels, items, labels, lists, members, projects, type List, type Project } from "../db/schema";
import { logActivity } from "./activity";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The ids of every project the user is a member of (private projects are visible to members only). */
export const memberProjectIds = async (userId: string): Promise<string[]> => (await db.select({ projectId: members.projectId }).from(members).where(eq(members.userId, userId))).map((m) => m.projectId);

/** Reserve `count` consecutive item key numbers in a group and return the first (keys are per group, never reused). */
export async function issueKeyNumbers(tx: Tx | typeof db, groupId: string, count: number): Promise<number> {
  const [g] = await tx
    .update(groups)
    .set({ nextItemNumber: sql`${groups.nextItemNumber} + ${count}` })
    .where(eq(groups.id, groupId))
    .returning({ n: groups.nextItemNumber });
  if (!g) throw new Error("Group not found");
  return g.n - count;
}
export const issueKeyNumber = (tx: Tx | typeof db, groupId: string) => issueKeyNumbers(tx, groupId, 1);

/** Create a project with its lists from a template or by copying another project's lists; the creator becomes owner. */
export async function createProject(input: CreateProjectInput, userId: string, outer?: Tx): Promise<{ project: Project; lists: List[] }> {
  const run = async (tx: Tx) => {
    const max = (await tx.select({ max: sql<number>`coalesce(max(${projects.position}), -1)` }).from(projects).where(eq(projects.groupId, input.groupId)))[0]?.max ?? -1;
    let seed: Array<{ name: string; statusRole: List["statusRole"]; icon: string | null }> = (input.lists ?? []).map(([name, role]) => ({ name, statusRole: role ?? null, icon: null }));
    let copyFrom: Project | undefined;
    if (input.copyFrom) {
      [copyFrom] = await tx.select().from(projects).where(eq(projects.id, input.copyFrom));
      if (!copyFrom) throw new Error("Project to copy not found");
      const src = await tx.select().from(lists).where(eq(lists.projectId, input.copyFrom)).orderBy(asc(lists.position));
      seed = src.map((l) => ({ name: l.name, statusRole: l.statusRole, icon: l.icon }));
    }
    const [project] = await tx
      .insert(projects)
      .values({
        id: input.id,
        groupId: input.groupId,
        name: input.name,
        icon: input.icon ?? copyFrom?.icon ?? "kanban",
        color: input.color ?? copyFrom?.color ?? "blue",
        visibility: input.visibility ?? copyFrom?.visibility ?? "private",
        defaultView: copyFrom?.defaultView ?? "list",
        linkStatuses: copyFrom?.linkStatuses ?? true,
        position: max + 1,
      })
      .returning();
    const created = seed.length ? await tx.insert(lists).values(seed.map((l, i) => ({ id: nanoid(), projectId: project!.id, ...l, position: i }))).returning() : [];
    await tx.insert(members).values({ projectId: project!.id, userId, role: "owner" });
    return { project: project!, lists: created };
  };
  return outer ? run(outer) : db.transaction(run);
}

/** Import a reviewed plan as a new project — project, lists, labels, items and subitems in one transaction, keys from one counter bump. */
export async function importProject({ id, groupId, name, plan }: ImportProjectInput, userId: string): Promise<{ project: Project; lists: List[]; items: number }> {
  return db.transaction(async (tx) => {
    const { project, lists: made } = await createProject({ id, groupId, name, lists: plan.lists.map((l) => [l.name, l.statusRole ?? null]) }, userId, tx);
    const listId = new Map(made.map((l) => [l.name, l.id]));
    const labelRows = plan.labels.length ? await tx.insert(labels).values(plan.labels.map((l, i) => ({ id: nanoid(), projectId: project.id, name: l.name, color: l.color ?? LABEL_COLORS[i % LABEL_COLORS.length]! }))).returning() : [];
    const labelId = new Map(labelRows.map((l) => [l.name.toLowerCase(), l.id]));
    const total = plan.lists.reduce((n, l) => n + l.items.reduce((m, it) => m + 1 + it.subitems.length, 0), 0);
    let key = total ? await issueKeyNumbers(tx, project.groupId, total) : 0;
    const rows: Array<typeof items.$inferInsert> = [];
    const links: Array<typeof itemLabels.$inferInsert> = [];
    for (const l of plan.lists) {
      const lid = listId.get(l.name);
      if (!lid) continue;
      l.items.forEach((it, position) => {
        const itemId = nanoid();
        const status = it.done ? "DONE" : (l.statusRole ?? null);
        rows.push({ id: itemId, listId: lid, projectId: project.id, title: it.title, description: it.description ?? null, dueDate: it.due ?? null, priority: it.priority ?? null, status, priorStatus: it.done ? (l.statusRole ?? null) : null, done: it.done, keyNumber: key++, position, createdBy: userId });
        for (const n of it.labels) {
          const lab = labelId.get(n.toLowerCase());
          if (lab) links.push({ itemId, labelId: lab });
        }
        it.subitems.forEach((s, j) => rows.push({ id: nanoid(), listId: lid, projectId: project.id, parentItemId: itemId, title: s.title, status: s.done ? "DONE" : (l.statusRole ?? null), done: s.done, keyNumber: key++, position: j, createdBy: userId }));
      });
    }
    for (let i = 0; i < rows.length; i += 500) await tx.insert(items).values(rows.slice(i, i + 500));
    if (links.length) await tx.insert(itemLabels).values(links).onConflictDoNothing();
    await logActivity(tx, { projectId: project.id, actorId: userId, type: "settings", text: `imported ${rows.length} item${rows.length === 1 ? "" : "s"} into ${plan.lists.length} list${plan.lists.length === 1 ? "" : "s"}` });
    return { project, lists: made, items: rows.length };
  });
}

/** Patch a list; a Status-role change rewrites existing items only when asked (never silently). */
export async function updateList(id: string, { applyToExisting, ...patch }: UpdateListInput): Promise<{ list: List; rewritten: number } | null> {
  return db.transaction(async (tx) => {
    const [list] = await tx.update(lists).set(patch).where(eq(lists.id, id)).returning();
    if (!list) return null;
    let rewritten = 0;
    if (patch.statusRole !== undefined && applyToExisting && list.statusRole) {
      const rows = await tx
        .update(items)
        .set({ status: list.statusRole, done: list.statusRole === "DONE" })
        .where(and(eq(items.listId, id), isNull(items.parentItemId), isNull(items.deletedAt)))
        .returning({ id: items.id });
      rewritten = rows.length;
    }
    return { list, rewritten };
  });
}

/** Lists of a project in order, with their live top-level item counts. */
export async function listsWithCounts(projectId: string) {
  const ls = await db.select().from(lists).where(eq(lists.projectId, projectId)).orderBy(asc(lists.position));
  const counts = await db
    .select({ listId: items.listId, n: sql<number>`count(*)::int` })
    .from(items)
    .where(and(eq(items.projectId, projectId), isNull(items.parentItemId), isNull(items.deletedAt), isNull(items.archivedAt)))
    .groupBy(items.listId);
  const byList = new Map(counts.map((c) => [c.listId, c.n]));
  return ls.map((list) => ({ list, count: byList.get(list.id) ?? 0 }));
}

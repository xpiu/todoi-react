// Group / project / list behaviours shared by the routes and the seed. Spec: DESIGN.md › Project lifecycle,
// Lists & Status linking.
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import type { CreateProjectInput, UpdateListInput } from "../../shared/projects";
import { db } from "../db";
import { groups, items, lists, members, projects, type List, type Project } from "../db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Issue the next item key number in a group (keys are per group, never reused). */
export async function issueKeyNumber(tx: Tx | typeof db, groupId: string): Promise<number> {
  const [g] = await tx
    .update(groups)
    .set({ nextItemNumber: sql`${groups.nextItemNumber} + 1` })
    .where(eq(groups.id, groupId))
    .returning({ n: groups.nextItemNumber });
  if (!g) throw new Error("Group not found");
  return g.n - 1;
}

/** Create a project with its lists from a template or by copying another project's lists; the creator becomes owner. */
export async function createProject(input: CreateProjectInput, userId: string): Promise<{ project: Project; lists: List[] }> {
  return db.transaction(async (tx) => {
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

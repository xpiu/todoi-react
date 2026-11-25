import { and, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";

import { TRASH_RETENTION_DAYS } from "../../shared/enums";
import { afterCommit, db, type Tx } from "../db";
import { items, projects, type Item } from "../db/schema";
import { logActivity, quote } from "./activity";
import { drainUploadCleanup } from "./uploadCleanup";

/** Removal is inherited, not copied: restoring a container preserves each child's own state. `states`: which removals count. */
const itemContainersFree = (states: ReadonlyArray<"archived_at" | "deleted_at">) => {
  const removed = (alias: string) => sql.raw(states.map((c) => `${alias}.${c} is not null`).join(" or "));
  return sql`(
  (${items.projectId} is null or exists (
    select 1 from projects as container_project where container_project.id = ${items.projectId}
      and not (${removed("container_project")})
  )) and not exists (
    with recursive ancestors as (
      select id, parent_item_id, archived_at, deleted_at from items as parent where parent.id = ${items.parentItemId}
      union
      select parent.id, parent.parent_item_id, parent.archived_at, parent.deleted_at
      from items as parent join ancestors on parent.id = ancestors.parent_item_id
    ) select 1 from ancestors where ${removed("ancestors")}
  )
)`;
};
export const itemContainersLive = itemContainersFree(["archived_at", "deleted_at"]);
/** Neither the item nor its project or parent is in the Trash; archived ones pass (Search's "Include archived"). */
export const itemNotDeleted = and(isNull(items.deletedAt), itemContainersFree(["deleted_at"]));
/** The item, its project or its parent is archived. */
export const itemArchived = sql<boolean>`not (${and(isNull(items.archivedAt), itemContainersFree(["archived_at"]))})`;
export const itemIsLive = and(isNull(items.archivedAt), isNull(items.deletedAt), itemContainersLive);

type LifecycleChange = { archived?: boolean; deleted?: boolean };
const timestamps = ({ archived, deleted }: LifecycleChange) => ({
  ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }),
  ...(deleted === undefined ? {} : { deletedAt: deleted ? new Date() : null }),
});

/** `outer`: run inside the caller's transaction (an item update that also archives or restores). */
export async function setItemLifecycle(id: string, change: LifecycleChange, actorId: string, fields: Partial<Item> = {}, outer?: Tx) {
  const update = async (connection: typeof db | Tx) => {
    const [item] = await connection.update(items).set({ ...fields, ...timestamps(change) }).where(eq(items.id, id)).returning();
    return item;
  };
  if (change.archived === undefined && change.deleted === undefined) return update(outer ?? db);
  const run = async (tx: Tx) => {
    const item = await update(tx);
    if (item) {
      const verb = change.deleted ? "deleted" : change.archived ? "archived" : "restored";
      await logActivity(tx, { projectId: item.projectId, actorId, type: "item", text: `${verb} ${quote(item.title)}`, itemId: id, itemKey: item.keyNumber == null ? null : String(item.keyNumber) });
    }
    return item;
  };
  return outer ? run(outer) : db.transaction(run);
}

export async function setProjectLifecycle(id: string, change: LifecycleChange) {
  const [project] = await db.update(projects).set(timestamps(change)).where(eq(projects.id, id)).returning();
  return project;
}

/** Foreign keys remove dependents; the attachment trigger queues file cleanup in the same commit. */
export async function destroyItem(id: string) {
  const [item] = await db.delete(items).where(eq(items.id, id)).returning({ id: items.id });
  await afterCommit(drainUploadCleanup);
  return item;
}

export async function destroyProject(id: string) {
  const [project] = await db.delete(projects).where(eq(projects.id, id)).returning({ id: projects.id });
  await afterCommit(drainUploadCleanup);
  return project;
}

/**
 * The Trash keeps what's in it for TRASH_RETENTION_DAYS (the promise the UI makes), then it goes for good:
 * items and projects whose own removal is that old, with everything under them (cascades), files included.
 */
export async function purgeTrash(days = TRASH_RETENTION_DAYS): Promise<{ items: number; projects: number }> {
  const cutoff = sql`now() - ${days} * interval '1 day'`;
  const result = await db.transaction(async (tx) => {
    const gone = await tx.delete(projects).where(and(isNotNull(projects.deletedAt), lt(projects.deletedAt, cutoff))).returning({ id: projects.id });
    // Deleting a parent removes its subitems too (the parent key cascades).
    const goneItems = await tx.delete(items).where(and(isNotNull(items.deletedAt), lt(items.deletedAt, cutoff))).returning({ id: items.id });
    return { items: goneItems.length, projects: gone.length };
  });
  if (result.items || result.projects) await drainUploadCleanup();
  return result;
}

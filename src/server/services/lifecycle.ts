import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "../db";
import { items, projects, type Item } from "../db/schema";
import { logActivity, quote } from "./activity";
import { drainUploadCleanup } from "./uploadCleanup";

/** Removal is inherited, not copied: restoring a container preserves each child's own state. */
export const itemContainersLive = sql`(
  (${items.projectId} is null or exists (
    select 1 from projects as container_project where container_project.id = ${items.projectId}
      and container_project.archived_at is null and container_project.deleted_at is null
  )) and not exists (
    with recursive ancestors as (
      select id, parent_item_id, archived_at, deleted_at from items as parent where parent.id = ${items.parentItemId}
      union
      select parent.id, parent.parent_item_id, parent.archived_at, parent.deleted_at
      from items as parent join ancestors on parent.id = ancestors.parent_item_id
    ) select 1 from ancestors where archived_at is not null or deleted_at is not null
  )
)`;
export const itemIsLive = and(isNull(items.archivedAt), isNull(items.deletedAt), itemContainersLive);

type LifecycleChange = { archived?: boolean; deleted?: boolean };
const timestamps = ({ archived, deleted }: LifecycleChange) => ({
  ...(archived === undefined ? {} : { archivedAt: archived ? new Date() : null }),
  ...(deleted === undefined ? {} : { deletedAt: deleted ? new Date() : null }),
});

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
  await drainUploadCleanup();
  return item;
}

export async function destroyProject(id: string) {
  const [project] = await db.delete(projects).where(eq(projects.id, id)).returning({ id: projects.id });
  await drainUploadCleanup();
  return project;
}

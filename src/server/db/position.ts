import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";

import type { db, Tx } from ".";

/** Where a new row goes at the end of an ordered set: one past the highest `position` among the rows matching `where`, 0 when there are none. */
export async function nextPosition(source: typeof db | Tx, table: PgTable & { position: AnyPgColumn }, where: SQL | undefined): Promise<number> {
  const [last] = await source.select({ max: sql<number>`coalesce(max(${table.position}), -1)` }).from(table).where(where);
  return (last?.max ?? -1) + 1;
}

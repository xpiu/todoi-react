// Item search for the top-bar dropdown and the command palette: the viewer's live items in the
// projects they are a member of, plus their own Inbox, by title or key ("MP-115", "115"). Bounded,
// so a large workspace never ships whole projects to find one item. Spec: DESIGN.md › Search dropdown.
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "../db";
import { groups, items, lists, projects } from "../db/schema";
import { itemIsLive } from "./lifecycle";
import { memberProjectIds } from "./projects";

export const SEARCH_LIMIT = 20;

export interface SearchHit {
  id: string;
  title: string;
  done: boolean;
  keyNumber: number | null;
  keyPrefix: string | null;
  projectId: string | null;
  projectName: string | null;
  listId: string;
  listName: string;
  parentItemId: string | null;
  parentTitle: string | null;
}

/** `%`, `_` and `\` are literal in the query. */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (ch) => `\\${ch}`);

export async function searchItems(viewer: { userId: string; inboxListId: string }, query: string, limit = SEARCH_LIMIT): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const mine = await memberProjectIds(viewer.userId);
  const parent = alias(items, "parent");
  const key = /^(?:([a-z0-9]{1,5})-)?(\d{1,9})$/i.exec(q);
  // "MP-115" → that exact key; "115" → that number in any group.
  const keyMatch: SQL | undefined = key ? and(eq(items.keyNumber, Number(key[2])), key[1] ? eq(sql`upper(${groups.keyPrefix})`, key[1].toUpperCase()) : undefined) : undefined;
  const textMatch = ilike(items.title, `%${likeEscape(q)}%`);
  const scope = or(eq(items.listId, viewer.inboxListId), mine.length ? and(inArray(items.projectId, mine), isNull(projects.archivedAt), isNull(projects.deletedAt), isNull(groups.archivedAt), isNull(groups.deletedAt)) : undefined);
  return db
    .select({
      id: items.id,
      title: items.title,
      done: items.done,
      keyNumber: items.keyNumber,
      keyPrefix: groups.keyPrefix,
      projectId: items.projectId,
      projectName: projects.name,
      listId: items.listId,
      listName: lists.name,
      parentItemId: items.parentItemId,
      parentTitle: parent.title,
    })
    .from(items)
    .innerJoin(lists, eq(lists.id, items.listId))
    .leftJoin(projects, eq(projects.id, items.projectId))
    .leftJoin(groups, eq(groups.id, projects.groupId))
    .leftJoin(parent, eq(parent.id, items.parentItemId))
    .where(and(scope, itemIsLive, keyMatch ? or(keyMatch, textMatch) : textMatch))
    // Exact key first, then titles that start with the query, open before done, recent first.
    .orderBy(
      ...(keyMatch ? [desc(sql`coalesce(${keyMatch}, false)`)] : []),
      desc(ilike(items.title, `${likeEscape(q)}%`)),
      asc(items.done),
      desc(items.updatedAt),
    )
    .limit(limit);
}

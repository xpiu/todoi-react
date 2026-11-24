// Item search over the viewer's items in the projects they are a member of, plus their own Inbox.
// `searchItems`: the top-bar dropdown and the command palette, by title or key ("MP-115", "115").
// `fullSearch`: the Search page, full text over titles, descriptions and comments, with filters and paging.
// Both are bounded, so a large workspace never ships whole projects to find one item.
// Spec: DESIGN.md › Search dropdown, Search page.
import { and, asc, desc, eq, exists, ilike, inArray, isNull, not, or, sql, type SQL } from "drizzle-orm";
import { alias, union } from "drizzle-orm/pg-core";

import type { ItemStatus } from "../../shared/item-status";
import { readableItemIds } from "../access";
import { db } from "../db";
import { comments, groups, itemAssignees, items, lists, projects, searchDocument, users } from "../db/schema";
import { itemArchived, itemIsLive, itemNotDeleted } from "./lifecycle";
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

type Viewer = { userId: string; inboxListId: string };
const parent = alias(items, "parent");

/** `%`, `_` and `\` are literal in the query. */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (ch) => `\\${ch}`);

/** "MP-115" → that exact key; "115" → that number in any group (needs `groups` joined). */
function keyMatchOf(q: string): SQL | undefined {
  const key = /^(?:([a-z0-9]{1,5})-)?(\d{1,9})$/i.exec(q);
  return key ? and(eq(items.keyNumber, Number(key[2])), key[1] ? eq(sql`upper(${groups.keyPrefix})`, key[1].toUpperCase()) : undefined) : undefined;
}

/** The viewer's Inbox and member projects in groups that aren't removed (archived groups only with `archived`). */
const viewerScope = (viewer: Viewer, mine: string[], archived = false) =>
  or(eq(items.listId, viewer.inboxListId), mine.length ? and(inArray(items.projectId, mine), isNull(groups.deletedAt), archived ? undefined : isNull(groups.archivedAt)) : undefined);

/** One hit's columns; both searches join items → list, project, group and parent the same way. */
const hitColumns = {
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
};

export async function searchItems(viewer: Viewer, query: string, limit = SEARCH_LIMIT): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const mine = await memberProjectIds(viewer.userId);
  const keyMatch = keyMatchOf(q);
  const textMatch = ilike(items.title, `%${likeEscape(q)}%`);
  return db
    .select(hitColumns)
    .from(items)
    .innerJoin(lists, eq(lists.id, items.listId))
    .leftJoin(projects, eq(projects.id, items.projectId))
    .leftJoin(groups, eq(groups.id, projects.groupId))
    .leftJoin(parent, eq(parent.id, items.parentItemId))
    .where(and(viewerScope(viewer, mine), itemIsLive, keyMatch ? or(keyMatch, textMatch) : textMatch))
    // Exact key first, then titles that start with the query, open before done, recent first.
    .orderBy(
      ...(keyMatch ? [desc(sql`coalesce(${keyMatch}, false)`)] : []),
      desc(ilike(items.title, `${likeEscape(q)}%`)),
      asc(items.done),
      desc(items.updatedAt),
    )
    .limit(limit);
}

// ── Search page ───────────────────────────────────────────────────────────────

export const FULL_SEARCH_PAGE = 20;
/** Shorter queries match nothing (too many prefixes). */
export const FULL_SEARCH_MIN = 2;
/** Description and comment text sent for the snippet; the client cuts the one line it shows. */
const MATCH_TEXT_MAX = 2000;

export type SearchMatchField = "title" | "description" | "comment";
export interface FullSearchFilters {
  projectId?: string;
  /** The Status a row shows: its own, or Done for a checked item without one */
  status?: ItemStatus;
  /** A user id, or "none" for unassigned items */
  assignee?: string;
  /** Also archived items and items in archived projects, groups or parents (never the Trash) */
  archived?: boolean;
}
export interface FullSearchHit extends SearchHit {
  archived: boolean;
  /** Where the item matched best: its title (or key), else its description, else its best comment with the author's stored name. */
  match: { field: SearchMatchField; text?: string; author?: string };
}

/**
 * The words of a query as a tsquery: every word must match, the last one also as the start of a word
 * ("rotor bla" → `'rotor' & 'bla':*`). Each word is quoted, so tsquery operators in it are literal;
 * Postgres splits a quoted word the way it splits the text ("e-mail"). Null when the query is too short.
 */
export function searchTsQuery(query: string): string | null {
  const q = query.trim();
  if (q.length < FULL_SEARCH_MIN) return null;
  const words = q.split(/\s+/);
  const quote = (w: string) => `'${w.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
  return words.map((w, i) => quote(w) + (i === words.length - 1 && w.length >= FULL_SEARCH_MIN ? ":*" : "")).join(" & ");
}

/**
 * The Search page: one hit per item with its best match, ranked title > description > comments (then
 * ts_rank over the weighted fields A/B/C, then the most recently updated), `offset`/`limit` paging and the
 * total. Candidates come from the GIN indexes on titles, descriptions and comment bodies (schema.ts).
 */
export async function fullSearch(viewer: Viewer, query: string, filters: FullSearchFilters = {}, offset = 0, limit = FULL_SEARCH_PAGE): Promise<{ hits: FullSearchHit[]; total: number }> {
  const ts = searchTsQuery(query);
  if (!ts) return { hits: [], total: 0 };
  const mine = await memberProjectIds(viewer.userId);
  const tsq = sql`to_tsquery('simple', ${ts})`;
  const titleDoc = searchDocument(items.title), descriptionDoc = searchDocument(items.description), commentDoc = searchDocument(comments.body);
  const keyMatch = keyMatchOf(query.trim());
  const textCandidates = db.select({ id: items.id }).from(items).where(or(sql`${titleDoc} @@ ${tsq}`, sql`${descriptionDoc} @@ ${tsq}`));
  const commentCandidates = db.select({ id: comments.itemId }).from(comments).where(sql`${commentDoc} @@ ${tsq}`);
  const candidates = keyMatch
    ? union(textCandidates, commentCandidates, db.select({ id: items.id }).from(items).innerJoin(projects, eq(projects.id, items.projectId)).innerJoin(groups, eq(groups.id, projects.groupId)).where(keyMatch))
    : union(textCandidates, commentCandidates);
  // The item's best comment: the highest-ranked matching one, the newest on a tie. Authors keep their stored name.
  const best = db
    .select({ body: comments.body, author: users.name, rank: sql<number>`ts_rank(setweight(${commentDoc}, 'C'), ${tsq})`.as("comment_rank") })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.authorId))
    .where(and(eq(comments.itemId, items.id), sql`${commentDoc} @@ ${tsq}`))
    .orderBy(desc(sql`comment_rank`), desc(comments.createdAt))
    .limit(1)
    .as("best_comment");
  const inTitle = keyMatch ? sql`(${titleDoc} @@ ${tsq} or coalesce(${keyMatch}, false))` : sql`${titleDoc} @@ ${tsq}`;
  const tier = sql<number>`case when ${inTitle} then 0 when ${descriptionDoc} @@ ${tsq} then 1 else 2 end`;
  const rank = sql`ts_rank(setweight(${titleDoc}, 'A') || setweight(${descriptionDoc}, 'B') || setweight(to_tsvector('simple', coalesce(${best.body}, '')), 'C'), ${tsq})`;
  const assigned = (userId?: string) => db.select({ one: sql`1` }).from(itemAssignees).where(and(eq(itemAssignees.itemId, items.id), userId ? eq(itemAssignees.userId, userId) : undefined));
  const rows = await db
    .select({
      ...hitColumns,
      archived: sql<boolean>`(${itemArchived} or ${groups.archivedAt} is not null)`,
      tier,
      description: sql<string | null>`left(${items.description}, ${MATCH_TEXT_MAX})`,
      commentBody: sql<string | null>`left(${best.body}, ${MATCH_TEXT_MAX})`,
      commentAuthor: best.author,
      total: sql<number>`count(*) over ()`.mapWith(Number),
    })
    .from(items)
    .innerJoin(lists, eq(lists.id, items.listId))
    .leftJoin(projects, eq(projects.id, items.projectId))
    .leftJoin(groups, eq(groups.id, projects.groupId))
    .leftJoin(parent, eq(parent.id, items.parentItemId))
    .leftJoinLateral(best, sql`true`)
    .where(
      and(
        inArray(items.id, candidates),
        viewerScope(viewer, mine, filters.archived),
        filters.archived ? itemNotDeleted : itemIsLive,
        filters.projectId ? eq(items.projectId, filters.projectId) : undefined,
        filters.status ? sql`coalesce(${items.status}::text, case when ${items.done} then 'DONE' end) = ${filters.status}` : undefined,
        filters.assignee === "none" ? not(exists(assigned())) : filters.assignee ? exists(assigned(filters.assignee)) : undefined,
      ),
    )
    .orderBy(asc(tier), desc(rank), desc(items.updatedAt), asc(items.id))
    .offset(offset)
    .limit(limit);
  // Past the last page the window count is gone, so count from the first page.
  let total = rows[0]?.total ?? (offset > 0 ? (await fullSearch(viewer, query, filters, 0, 1)).total : 0);
  // Every hit passes the read rule the item routes use once more.
  const readable = await readableItemIds(viewer, rows);
  total -= rows.length - readable.size;
  const hits = rows
    .filter((r) => readable.has(r.id))
    .map(({ tier: where, description, commentBody, commentAuthor, total: _count, ...hit }): FullSearchHit => ({
      ...hit,
      match: where === 0 ? { field: "title" } : where === 1 ? { field: "description", text: description ?? "" } : { field: "comment", text: commentBody ?? "", author: commentAuthor ?? undefined },
    }));
  return { hits, total };
}

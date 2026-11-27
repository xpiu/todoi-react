// The link syntax (README › Links). A project lives at the root under its slug, a short public id that is
// not the database id: /epd5vjxy38. The view rides in the query (`v`, see viewState.ts) and an open item is
// named by its key, or by its id while it has none: /epd5vjxy38?v=board&item=MP-102.

export const PROJECT_SLUG_LENGTH = 10;
/** Lowercase letters and digits without o, 0, 1 and l, which read alike. The database makes slugs from the same set (migration 0025). */
export const PROJECT_SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
const SLUG = new RegExp(`^[${PROJECT_SLUG_ALPHABET}]{${PROJECT_SLUG_LENGTH}}$`);

/**
 * A slug always holds a digit, so it never spells a word and never equals an app route (/inbox, /settings…).
 * Keep it that way: no top-level route of exactly 10 characters with a digit from 2 to 9.
 */
export const isProjectSlug = (value: string): boolean => SLUG.test(value) && /[2-9]/.test(value);

/** "MP-102" */
export const itemKey = (keyPrefix: string | null | undefined, keyNumber: number | null | undefined): string | undefined => (keyPrefix && keyNumber != null ? `${keyPrefix}-${keyNumber}` : undefined);

/** The number behind a key as a link carries it ("MP-102", "mp-102" → 102); null for anything else, such as an item id. */
export function itemKeyNumber(ref: string): number | null {
  const match = /^[A-Za-z0-9]{2,5}-([1-9]\d{0,8})$/.exec(ref);
  return match ? Number(match[1]) : null;
}

/** What a link's `item` names an item by: its key, else its id (an Inbox item, or one made offline, has no key yet). */
export const itemRef = (item: { id: string; keyNumber: number | null }, keyPrefix: string | null | undefined): string => itemKey(keyPrefix, item.keyNumber) ?? item.id;

/**
 * The item `ref` names among a project's items: by id first, then by key number. The prefix is not compared:
 * numbers are unique within a project, and a link should survive its group's prefix being renamed.
 */
export function findItemByRef<T extends { id: string; keyNumber: number | null }>(items: readonly T[], ref: string): T | undefined {
  const byId = items.find((it) => it.id === ref);
  if (byId) return byId;
  const n = itemKeyNumber(ref);
  return n == null ? undefined : items.find((it) => it.keyNumber === n);
}

/** A project's path with an optional query ("?v=board") */
export const projectPath = (slug: string, query = ""): string => `/${slug}${query}`;

/** An item's absolute link: opened over its project, or in the Inbox (calendar events, notification emails). */
export const itemLink = (appUrl: string, item: { id: string; keyNumber: number | null }, project: { slug: string; keyPrefix: string | null } | null): string =>
  `${appUrl.replace(/\/$/, "")}${project ? projectPath(project.slug) : "/inbox"}?item=${encodeURIComponent(project ? itemRef(item, project.keyPrefix) : item.id)}`;

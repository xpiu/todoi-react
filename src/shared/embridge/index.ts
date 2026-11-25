// Embridge (https://github.com/embridge-foundation/embridge), the Markdown item-list format Todoi reads
// and writes. Parsing is the reference parser's, so Todoi reads exactly what the spec's conformance suite
// pins; this module adds what tooling needs on top of the parse tree: canonical field names and order,
// identity repair and the attachment convention. The writer is ./write.ts.
import { parseEmbridge as parseReference } from "embridge";

import type { EmbridgeDocument, EmbridgeItem, EmbridgeList } from "./types";

export type * from "./types";

export const EMBRIDGE_VERSION = "0.2.2";
export const EMBRIDGE_FORMAT = `Embridge v${EMBRIDGE_VERSION}, github.com/embridge-foundation/embridge`;

/** Parse Embridge Markdown (BOM, CRLF and CR tolerated). Never throws; problems land in `diagnostics`. */
export function parseEmbridge(markdown: string): EmbridgeDocument {
  return parseReference(markdown);
}

/** Canonical item field names → the aliases readers accept (spec › Standard Fields). */
export const FIELD_ALIASES: Readonly<Record<string, readonly string[]>> = {
  description: ["desc", "descr"],
  status: [],
  prio: ["priority"],
  tags: ["keywords"],
  assignee: ["owner", "assigned"],
  created: ["date", "createddate"],
  updated: ["modified", "mod"],
  on: ["ondate", "on-date", "scheduled"],
  due: ["duedate"],
  id: [],
};
/** The order writers emit standard fields in; custom fields follow in their own order. */
export const CANONICAL_FIELD_ORDER = Object.keys(FIELD_ALIASES);

const canonicalByAlias = new Map<string, string>(Object.entries(FIELD_ALIASES).flatMap(([key, aliases]) => [[key, key] as const, ...aliases.map((a) => [a, key] as const)]));

/** "Prio" → "prio", "duedate" → "due", "Ref" → "ref": standard keys fold their aliases, every key lowercases. */
export const canonicalKey = (key: string) => {
  const lower = key.toLowerCase();
  return canonicalByAlias.get(lower) ?? lower;
};

/**
 * Fields under canonical names, last value winning when a key and its alias both appear (the spec's
 * repeated-field rule). Empty values are dropped: `id:` with nothing after it identifies nothing.
 */
export function canonicalFields(fields: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    const k = canonicalKey(key);
    if (value.trim() === "") continue;
    delete out[k];
    out[k] = value.trim();
  }
  return out;
}

/** Standard fields first, in canonical order, then custom ones as they came. */
export function orderFields(fields: Readonly<Record<string, string>>): Array<[string, string]> {
  const entries = Object.entries(fields);
  const rank = (k: string) => {
    const i = CANONICAL_FIELD_ORDER.indexOf(k);
    return i < 0 ? CANONICAL_FIELD_ORDER.length : i;
  };
  return entries.map((e, i) => ({ e, i })).sort((a, b) => rank(a.e[0]) - rank(b.e[0]) || a.i - b.i).map(({ e }) => e);
}

/** `tags: "backend, api"` → ["backend", "api"]. */
export const splitList = (value: string | undefined) => (value ?? "").split(",").map((t) => t.trim()).filter(Boolean);

/** `assignee: "@alice, team-backend"` → ["alice", "team-backend"]. */
export const splitPeople = (value: string | undefined) => splitList(value).map((p) => p.replace(/^@/, ""));

// ── Attachments (a convention: a subitem whose title is exactly one Markdown link or image) ──────────
const ATTACHMENT_TITLE = /^!?\[(?:\\.|[^\]\\\n])*\]\((?:\\.|[^)\\\n])+\)$/;
const ATTACHMENT_PARTS = /^(!?)\[((?:\\.|[^\]\\\n])*)\]\(((?:\\.|[^)\\\n])+)\)$/;

export const isAttachmentTitle = (title: string) => ATTACHMENT_TITLE.test(title.trim());

export function parseAttachmentTitle(title: string): { kind: "image" | "link"; label: string; url: string } | null {
  const m = ATTACHMENT_PARTS.exec(title.trim());
  if (!m) return null;
  const unescape = (s: string) => s.replace(/\\(.)/g, "$1");
  return { kind: m[1] ? "image" : "link", label: unescape(m[2]!), url: unescape(m[3]!) };
}

// ── Identity ──────────────────────────────────────────────────────────────────────────────────────────
const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** A fresh 7-character lowercase id, the spec's recommended default. */
export function newEmbridgeId(random: () => number = Math.random): string {
  let id = "";
  for (let i = 0; i < 7; i++) id += ID_ALPHABET[Math.floor(random() * ID_ALPHABET.length)];
  return id;
}

/** Depth-first, in file order: every item and subitem with the list it sits in and its depth (0 = top level). */
export function* walkItems(lists: readonly EmbridgeList[]): Generator<{ item: EmbridgeItem; list: EmbridgeList; depth: number; parent: EmbridgeItem | null }> {
  function* walk(items: readonly EmbridgeItem[], list: EmbridgeList, depth: number, parent: EmbridgeItem | null): Generator<{ item: EmbridgeItem; list: EmbridgeList; depth: number; parent: EmbridgeItem | null }> {
    for (const item of items) {
      yield { item, list, depth, parent };
      yield* walk(item.subitems, list, depth + 1, parent ?? item);
    }
  }
  for (const list of lists) yield* walk(list.items, list, 0, null);
}

/**
 * Item ids must be unique before they're used for matching (spec › id conformance). Keeps the first
 * occurrence, gives later duplicates a fresh id and returns one message per repair. Mutates `doc`.
 */
export function repairDuplicateIds(doc: EmbridgeDocument, newId: () => string = newEmbridgeId): string[] {
  const seen = new Set<string>();
  const messages: string[] = [];
  for (const { item } of walkItems(doc.lists)) {
    const key = Object.keys(item.fields).find((k) => k.toLowerCase() === "id" && item.fields[k]!.trim());
    if (!key) continue;
    const id = item.fields[key]!.trim();
    if (!seen.has(id)) {
      seen.add(id);
      continue;
    }
    let fresh = newId();
    while (seen.has(fresh)) fresh = newId();
    seen.add(fresh);
    for (const k of Object.keys(item.fields)) if (k.toLowerCase() === "id") delete item.fields[k];
    item.fields.id = fresh;
    messages.push(`“${item.title}” shared the id “${id}” with an earlier item, so it now has “${fresh}”`);
  }
  return messages;
}

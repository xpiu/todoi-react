// Embridge Markdown ⇄ project document. Reading is tolerant (the spec's reader guidance); writing is
// canonical and deterministic, so an unchanged document always gives the same bytes and Git diffs stay
// line-sized. Deeper nesting than Items › Subitems is flattened into subitems, with a warning per item.
import { parseDateValue, toISO } from "../dates";
import { ITEM_PRIORITIES, type ItemPriority } from "../enums";
import { suggestedRoleForTitle, type ItemStatus } from "../item-status";
import { canonicalFields, isAttachmentTitle, parseAttachmentTitle, parseEmbridge, repairDuplicateIds, splitList, splitPeople, type EmbridgeDocument, type EmbridgeItem } from "../embridge";
import { writeEmbridge, type WritableItem } from "../embridge/write";
import { docItem, type DocItem, type DocParse, type DocSubitem, type ProjectDoc } from "./model";

/** What an Embridge file calls a list that has no heading. */
export const UNNAMED_LIST = "Items";

const PRIORITY_IN: Record<string, ItemPriority> = { urgent: "URGENT", critical: "URGENT", high: "HIGH", "1": "HIGH", med: "MEDIUM", medium: "MEDIUM", "2": "MEDIUM", low: "LOW", "3": "LOW" };
const PRIORITY_OUT: Record<ItemPriority, string> = { URGENT: "urgent", HIGH: "high", MEDIUM: "med", LOW: "low" };
const STATUS_OUT: Record<ItemStatus, string> = { NEW: "new", BACKLOG: "backlog", TODO: "todo", DOING: "doing", DONE: "done" };
/** Fields this codec turns into item properties; every other field rides along in `fields`. */
const MAPPED = new Set(["id", "description", "status", "prio", "tags", "assignee", "on", "due"]);

const isoOf = (v: string) => {
  const d = parseDateValue(v);
  return d && /\d{4}/.test(v) ? toISO(d) : null;
};

export interface FromEmbridgeOptions {
  /** Ids for items whose id repeats an earlier one (default: the spec's 7-character ids) */
  newId?: () => string;
}

/** Parse Embridge Markdown (or an already-parsed tree) into a project document. */
export function fromEmbridge(source: string | EmbridgeDocument, opts: FromEmbridgeOptions = {}): DocParse {
  const tree = typeof source === "string" ? parseEmbridge(source) : source;
  const lines = typeof source === "string" ? source.replace(/\r\n?/g, "\n").split("\n") : [];
  // A repeated id is reported once, by the repair below, which also says what it became.
  const warnings = tree.diagnostics.filter((d) => !/^duplicate item id/i.test(d.message)).map((d) => readable(d.line, d.message, lines[d.line - 1]));
  warnings.push(...repairDuplicateIds(tree, opts.newId));

  /** A value Todoi can't use stays in the item's fields, verbatim, and the reader hears why. */
  const keep = (target: DocItem, key: string, value: string, warning: string) => {
    target.fields[key] = value;
    warnings.push(warning);
  };
  const item = (src: EmbridgeItem, where: string): DocItem => {
    const f = canonicalFields(src.fields);
    const out = docItem(src.title.trim() || "Untitled");
    out.id = f.id ?? null;
    out.description = src.description ?? f.description ?? null;
    const prio = f.prio?.toLowerCase();
    if (prio && PRIORITY_IN[prio]) out.priority = PRIORITY_IN[prio];
    else if (prio && ITEM_PRIORITIES.includes(prio.toUpperCase() as ItemPriority)) out.priority = prio.toUpperCase() as ItemPriority;
    else if (f.prio) keep(out, "prio", f.prio, `“${out.title}”${where}: Todoi doesn't know the priority “${f.prio}”`);
    const status = f.status ? suggestedRoleForTitle(f.status) : null;
    if (f.status && !status) keep(out, "status", f.status, `“${out.title}”${where}: Todoi doesn't know the status “${f.status}”`);
    // The checkbox decides done; an explicit status: field decides the rest (spec › List Sections).
    out.done = src.completed ?? status === "DONE";
    out.status = out.done ? "DONE" : status === "DONE" ? null : status;
    out.labels = splitList(f.tags);
    out.assignees = splitPeople(f.assignee);
    for (const key of ["on", "due"] as const) {
      if (!f[key]) continue;
      const iso = isoOf(f[key]);
      if (iso) out[key === "on" ? "start" : "due"] = iso;
      else keep(out, key, f[key], `“${out.title}”${where}: “${f[key]}” (${key}) isn't a date Todoi can read`);
    }
    if (out.start && out.due && out.start > out.due) {
      keep(out, "on", out.start, `“${out.title}”${where}: the start (${out.start}) is after the due date, so only the due date is used`);
      out.start = null;
    }
    out.comments = src.comments.map((c) => ({ author: c.author, at: c.timestamp, text: c.text, depth: c.replyDepth }));
    for (const [k, v] of Object.entries(f)) if (!MAPPED.has(k)) out.fields[k] = v;
    return out;
  };

  const doc: ProjectDoc = { title: tree.documentMetadata?.title?.trim() ?? "", uuid: tree.documentMetadata?.uuid ?? null, lists: [] };
  for (const list of tree.lists) {
    if (list.title === null && !list.items.length) continue;
    const name = list.title?.trim() || UNNAMED_LIST;
    const items: DocItem[] = [];
    for (const top of list.items) {
      const parent = item(top, "");
      // Subitems and anything deeper, in file order: attachments attach to the item above them; the rest become subitems.
      const visit = (children: readonly EmbridgeItem[], owner: DocItem | DocSubitem, depth: number) => {
        for (const child of children) {
          const link = isAttachmentTitle(child.title) ? parseAttachmentTitle(child.title) : null;
          if (link) {
            owner.attachments.push({ label: link.label, url: link.url, image: link.kind === "image" });
            if (child.subitems.length) visit(child.subitems, owner, depth + 1);
            continue;
          }
          const { subitems: _drop, ...sub } = item(child, ` (under “${parent.title}”)`);
          if (depth > 1) warnings.push(`“${sub.title}” was ${depth === 2 ? "a subitem of a subitem" : `nested ${depth} levels under an item`}, so it's now a direct subitem of “${parent.title}”. Todoi has two levels: items and subitems`);
          parent.subitems.push(sub);
          visit(child.subitems, sub, depth + 1);
        }
      };
      visit(top.subitems, parent, 1);
      items.push(parent);
    }
    doc.lists.push({ id: list.id ?? null, name, items });
  }
  return { doc, warnings };
}

function readable(line: number, message: string, text: string | undefined): string {
  const quoted = text?.trim() ? `, “${text.trim().length > 40 ? `${text.trim().slice(0, 40)}…` : text.trim()}”` : "";
  if (/non-conformant free-form text/.test(message)) return `Line ${line}${quoted}: left out because it isn't a field, description or comment. To keep it, put it in quotes ("…") or start it with >`;
  return `Line ${line}${quoted}: ${message.charAt(0).toUpperCase()}${message.slice(1)}`;
}

function toWritable(it: DocItem | DocSubitem): WritableItem {
  const fields: Record<string, string> = {};
  if (it.status && it.status !== "DONE") fields.status = STATUS_OUT[it.status];
  if (it.priority) fields.prio = PRIORITY_OUT[it.priority];
  if (it.labels.length) fields.tags = it.labels.join(", ");
  if (it.assignees.length) fields.assignee = it.assignees.map((a) => `@${a}`).join(", ");
  if (it.start) fields.on = it.start;
  if (it.due) fields.due = it.due;
  if (it.id) fields.id = it.id;
  // Kept fields never overwrite what Todoi itself knows.
  for (const [k, v] of Object.entries(it.fields)) if (!(k in fields)) fields[k] = v;
  const escape = (s: string, chars: RegExp) => s.replace(chars, "\\$&");
  const attachments: WritableItem[] = it.attachments.map((a) => ({ title: `${a.image ? "!" : ""}[${escape(a.label, /[\]\\]/g)}](${escape(a.url, /[)\\]/g)})`, completed: null }));
  const subs = "subitems" in it ? it.subitems.map(toWritable) : [];
  return {
    title: it.title,
    completed: it.done,
    fields,
    description: it.description,
    comments: it.comments.map((c) => ({ replyDepth: c.depth, author: c.author, timestamp: c.at, text: c.text })),
    subitems: [...subs, ...attachments],
  };
}

export interface ToEmbridgeOptions {
  /** ISO 8601 instant of this write (the `sync:` line); omitted when absent so output stays deterministic */
  sync?: string | null;
}

/** Write a project document as canonical Embridge Markdown. */
export function toEmbridge(doc: ProjectDoc, opts: ToEmbridgeOptions = {}): string {
  return writeEmbridge({
    title: doc.title || null,
    sync: opts.sync ?? null,
    uuid: doc.uuid,
    lists: doc.lists.map((l) => ({ title: l.name, id: l.id ?? undefined, items: l.items.map(toWritable) })),
  });
}

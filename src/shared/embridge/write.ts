// The Embridge writer: round-trip-safe, canonical output (spec › Tooling export/rewrite normalization).
// Lists as `# ` headings, every item with a checkbox (attachments without), one metadata line in canonical
// field order with the description as `"…"` shorthand, comments after it, children indented to the
// parent's content column, and the document metadata block last. Deterministic: the same document always
// gives the same bytes, and writing what was parsed from this writer's output changes nothing.
import { EMBRIDGE_FORMAT, canonicalFields, isAttachmentTitle, orderFields } from "./index";
import type { EmbridgeComment, EmbridgeMarker } from "./types";

/** What the writer needs: the parse tree's shape, with everything optional that it can default. */
export interface WritableItem {
  title: string;
  completed: boolean | null;
  marker?: EmbridgeMarker;
  fields?: Readonly<Record<string, string>>;
  description?: string | null;
  comments?: readonly EmbridgeComment[];
  subitems?: readonly WritableItem[];
}
export interface WritableList {
  title: string | null;
  id?: string;
  items: readonly WritableItem[];
}
export interface WritableDocument {
  title?: string | null;
  sync?: string | null;
  uuid?: string | null;
  fields?: readonly string[] | null;
  lists: readonly WritableList[];
}

const needsQuotes = (v: string) => v === "" || /[,"\n\r]/.test(v) || /^\s|\s$/.test(v);
const quote = (v: string) => `"${v.replace(/"/g, '""')}"`;
const oneLine = (s: string) => s.replace(/\s*[\r\n]+\s*/g, " ").trim();
/** Only a description may span lines; a field value is folded onto one. */
const fieldValue = (v: string) => {
  const flat = oneLine(v);
  return needsQuotes(flat) ? quote(flat) : flat;
};

function markerText(marker: EmbridgeMarker | undefined): string {
  return marker?.type === "ordered" && Number.isInteger(marker.number) && marker.number >= 0 ? `${marker.number}. ` : "- ";
}

function metadataLine(item: WritableItem): string | null {
  const fields = canonicalFields(item.fields ?? {});
  // An explicit description field and the item's description are one value; the item's wins.
  const description = item.description ?? fields.description ?? null;
  delete fields.description;
  const rest = orderFields(fields).map(([k, v]) => `${k}: ${fieldValue(v)}`);
  const parts = description !== null && description !== "" ? [quote(description.replace(/\r\n?/g, "\n")), ...rest] : rest;
  return parts.length ? parts.join(", ") : null;
}

function commentLines(c: EmbridgeComment, indent: string): string[] {
  const marker = ">".repeat(Math.max(1, Math.floor(c.replyDepth) || 1));
  const prefix = c.author && c.timestamp ? `@${c.author} [${c.timestamp}]: ` : c.author ? `@${c.author}: ` : c.timestamp ? `[${c.timestamp}]: ` : "";
  return c.text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line, i) => `${indent}${marker} ${i === 0 ? prefix : ""}${line}`.trimEnd());
}

function writeItem(out: string[], item: WritableItem, indent: number) {
  const pad = " ".repeat(indent);
  const title = oneLine(item.title);
  const marker = markerText(item.marker);
  const checkbox = isAttachmentTitle(title) ? "" : item.completed ? "[x] " : "[ ] ";
  out.push(`${pad}${marker}${checkbox}${title}`);
  const meta = metadataLine(item);
  if (meta) out.push(`${pad}${meta}`);
  for (const c of item.comments ?? []) out.push(...commentLines(c, pad));
  for (const sub of item.subitems ?? []) writeItem(out, sub, indent + marker.length);
}

/** Serialize a document. List ids go to the `lists:` registry in the metadata block, not inline. */
export function writeEmbridge(doc: WritableDocument): string {
  const out: string[] = [];
  for (const list of doc.lists) {
    if (out.length) out.push("");
    if (list.title !== null) out.push(`# ${oneLine(list.title) || "Untitled"}`);
    for (const item of list.items) writeItem(out, item, 0);
  }
  const registry = doc.lists.filter((l): l is WritableList & { id: string; title: string } => !!l.id && l.title !== null);
  const meta = [
    doc.title && `title: ${oneLine(doc.title)}`,
    doc.sync && `sync: ${doc.sync}`,
    doc.uuid && `uuid: ${doc.uuid}`,
    registry.length && `lists: ${registry.map((l) => `${quote(oneLine(l.title) || "Untitled")} ${l.id}`).join(", ")}`,
    doc.fields?.length && `fields: ${doc.fields.join(", ")}`,
    `format: ${EMBRIDGE_FORMAT}`,
  ].filter((x): x is string => !!x);
  if (out.length) out.push("");
  // A metadata line always starts with "key:", so it can never be the block's closing "-->" line.
  out.push("<!--", ...meta, "-->");
  return `${out.join("\n")}\n`;
}

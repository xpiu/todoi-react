// The project file: how a project document is written as data (JSON and YAML share this one shape and
// one JSON Schema). Compact and deterministic — keys in a fixed order, empty values left out, Status
// and priority as the lowercase words Embridge uses — and strict on read, so an agent or CI job can
// validate an edit against the published schema before it pushes.
import { z } from "zod";

import { ITEM_PRIORITIES, type ItemPriority } from "../enums";
import { ITEM_STATUSES, type ItemStatus } from "../item-status";
import { docItem, docSubitem, type DocItem, type DocParse, type DocSubitem, type ProjectDoc } from "./model";

export const PROJECT_FILE_FORMAT = "todoi.project";
export const PROJECT_FILE_VERSION = 1;
/** Where the JSON Schema is published (public/schema/, generated from this file by its test). */
export const PROJECT_FILE_SCHEMA_URL = "https://todoi.com/schema/project-v1.json";

/** An enum's values as the lowercase words files use ("DOING" → "doing"). */
const lowercase = <T extends string>(values: readonly [T, ...T[]]) => values.map((v) => v.toLowerCase()) as [Lowercase<T>, ...Array<Lowercase<T>>];
const STATUS_WORDS = lowercase(ITEM_STATUSES);
const PRIORITY_WORDS = lowercase(ITEM_PRIORITIES);

const text = z.string();
// A real calendar day; the published schema carries the same rule as format "date" plus its pattern.
const isoDate = z.iso.date({ error: "must be a real date, YYYY-MM-DD" }).describe("A calendar day, YYYY-MM-DD");

const fileComment = z
  .object({
    author: text.nullish().describe("Who wrote it, without @"),
    at: text.nullish().describe("When, as written: 2026-09-20 or 2026-09-20 14:30"),
    text: text.min(1),
    depth: z.number().int().min(1).nullish().describe("1 (the default) for a comment, 2 for a reply to the comment above, …"),
  })
  .strict();
const fileAttachment = z
  .object({
    name: text.nullish(),
    url: text.min(1).describe("A link or a path in the repository"),
    image: z.boolean().nullish(),
  })
  .strict();
const itemFields = {
  id: text.min(1).nullish().describe("Stable within the file; tools add one when they first write the item"),
  title: text.min(1),
  done: z.boolean().nullish(),
  status: z.enum(STATUS_WORDS).nullish(),
  priority: z.enum(PRIORITY_WORDS).nullish(),
  start: isoDate.nullish(),
  due: isoDate.nullish(),
  labels: z.array(text.min(1)).nullish(),
  assignees: z.array(text.min(1)).nullish().describe("Names or handles, without @"),
  description: text.nullish().describe("Markdown"),
  comments: z.array(fileComment).nullish(),
  attachments: z.array(fileAttachment).nullish(),
  fields: z.record(text, text).nullish().describe("Your own values; Todoi keeps them as they are"),
};
const fileSubitem = z.object(itemFields).strict().describe("A subitem. Todoi has two levels, items and subitems, so a subitem has no subitems");
const fileItem = z.object({ ...itemFields, subitems: z.array(fileSubitem).nullish() }).strict();
const fileList = z
  .object({
    id: text.min(1).nullish(),
    name: text.min(1),
    items: z.array(fileItem).nullish(),
  })
  .strict();

export const projectFileSchema = z
  .object({
    $schema: text.nullish(),
    format: z.literal(PROJECT_FILE_FORMAT),
    version: z.literal(PROJECT_FILE_VERSION),
    title: text.nullish(),
    uuid: text.nullish(),
    lists: z.array(fileList),
  })
  .strict()
  .describe("A Todoi project: lists, items and subitems (todoi.com)");
export type ProjectFile = z.infer<typeof projectFileSchema>;

/** The JSON Schema agents and editors validate against (draft 2020-12). */
export const projectFileJsonSchema = () => ({
  ...z.toJSONSchema(projectFileSchema, { target: "draft-2020-12", io: "input" }),
  $id: PROJECT_FILE_SCHEMA_URL,
  title: "Todoi project file",
});

/** A file that isn't a valid project file: says where and what, in words a person can act on. */
export class ProjectFileError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join("; "));
    this.name = "ProjectFileError";
  }
}

const pathText = (path: ReadonlyArray<PropertyKey>) => path.reduce<string>((s, p) => (typeof p === "number" ? `${s}[${p}]` : `${s}${s ? "." : ""}${String(p)}`), "");

/** The title of the item at `path` (or the nearest one above it), so a message names it as well as its place. */
function titleAt(data: unknown, path: ReadonlyArray<PropertyKey>): string | null {
  let node: unknown = data, title: string | null = null;
  for (const p of path) {
    node = node && typeof node === "object" ? (node as Record<PropertyKey, unknown>)[p] : undefined;
    const t = node && typeof node === "object" && !Array.isArray(node) ? (node as Record<string, unknown>).title : undefined;
    if (typeof t === "string" && t) title = t;
  }
  return title;
}

function explain(issue: z.core.$ZodIssue, data: unknown): string {
  const at = pathText(issue.path);
  const itemPath = issue.code === "unrecognized_keys" ? issue.path : issue.path.slice(0, -1);
  const title = titleAt(data, itemPath);
  const where = `${at || "The file"}${title ? ` “${title}”` : ""}`;
  if (issue.code === "unrecognized_keys") {
    if (issue.keys.includes("subitems") && /subitems\[\d+\]$/.test(at)) {
      const parent = titleAt(data, issue.path.slice(0, -2));
      return `${where}: a subitem can't have its own subitems. Make them subitems of “${parent ?? "its item"}” or items in the list`;
    }
    const names = issue.keys.map((k) => `“${k}”`).join(", ");
    return `${where}: ${names} ${issue.keys.length === 1 ? "isn't a project file property" : "aren't project file properties"}. Remove ${issue.keys.length === 1 ? "it" : "them"}, or keep ${issue.keys.length === 1 ? "it" : "them"} in the file under fields`;
  }
  if (issue.code === "invalid_type" && issue.expected === "boolean") return `${where}: must be true or false`;
  if (issue.code === "invalid_type" && issue.expected === "string") return `${where}: must be text`;
  if (issue.code === "invalid_value" && issue.path.at(-1) === "format") return `format: must be "${PROJECT_FILE_FORMAT}"`;
  if (issue.code === "invalid_value" && issue.path.at(-1) === "version") return `version: must be ${PROJECT_FILE_VERSION}`;
  const message = issue.message.charAt(0).toLowerCase() + issue.message.slice(1);
  return `${where}: ${message}`;
}

/** At most `max` problems, then how many more there are. */
export function capProblems(problems: string[], max = 8): string[] {
  return problems.length > max ? [...problems.slice(0, max), `…and ${problems.length - max} more problem${problems.length - max === 1 ? "" : "s"}`] : problems;
}

/** Validate parsed data (from JSON or YAML) and turn it into a project document. Throws ProjectFileError. */
export function fileToDoc(data: unknown): DocParse {
  const parsed = projectFileSchema.safeParse(data);
  if (!parsed.success) throw new ProjectFileError(capProblems(parsed.error.issues.map((i) => explain(i, data))));
  const warnings: string[] = [];
  const seen = new Set<string>();
  const item = <T extends DocSubitem>(src: z.infer<typeof fileSubitem>, base: T): T => {
    const repeated = !!src.id && seen.has(src.id);
    if (repeated) warnings.push(`“${src.title}” repeats the id “${src.id}”, so Todoi treats it as a new item`);
    else if (src.id) seen.add(src.id);
    const status = src.status ? (src.status.toUpperCase() as ItemStatus) : null;
    const done = src.done ?? status === "DONE";
    const start = src.start && src.due && src.start > src.due ? null : (src.start ?? null);
    if (src.start && !start) warnings.push(`“${src.title}”: the start (${src.start}) is after the due date, so only the due date is used`);
    return {
      ...base,
      id: repeated ? null : (src.id ?? null),
      done,
      status: done ? "DONE" : status === "DONE" ? null : status,
      priority: src.priority ? (src.priority.toUpperCase() as ItemPriority) : null,
      start,
      due: src.due ?? null,
      labels: src.labels ?? [],
      assignees: (src.assignees ?? []).map((a) => a.replace(/^@/, "")),
      description: src.description ?? null,
      comments: (src.comments ?? []).map((c) => ({ author: c.author ?? null, at: c.at ?? null, text: c.text, depth: c.depth ?? 1 })),
      attachments: (src.attachments ?? []).map((a) => ({ label: a.name ?? "", url: a.url, image: !!a.image })),
      fields: { ...(src.fields ?? {}) },
    };
  };
  const file = parsed.data;
  const doc: ProjectDoc = {
    title: file.title ?? "",
    uuid: file.uuid ?? null,
    lists: file.lists.map((l) => ({
      id: l.id ?? null,
      name: l.name,
      items: (l.items ?? []).map((it): DocItem => ({ ...item(it, docItem(it.title)), subitems: (it.subitems ?? []).map((s) => item(s, docSubitem(s.title))) })),
    })),
  };
  return { doc, warnings };
}

/** A project document as file data: fixed key order, nothing empty, ready for JSON.stringify or YAML. */
export function docToFile(doc: ProjectDoc, opts: { schema?: boolean } = {}): Record<string, unknown> {
  const prune = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && !v.length) && !(typeof v === "object" && !Array.isArray(v) && !Object.keys(v as object).length)));
  const item = (it: DocSubitem): Record<string, unknown> =>
    prune({
      id: it.id,
      title: it.title,
      done: it.done,
      // Done is the checkbox; a Status word says anything else.
      status: it.status && it.status !== "DONE" ? it.status.toLowerCase() : null,
      priority: it.priority?.toLowerCase(),
      start: it.start,
      due: it.due,
      labels: it.labels,
      assignees: it.assignees,
      description: it.description,
      comments: it.comments.map((c) => prune({ author: c.author, at: c.at, text: c.text, depth: c.depth > 1 ? c.depth : null })),
      attachments: it.attachments.map((a) => prune({ name: a.label, url: a.url, image: a.image || null })),
      fields: Object.fromEntries(Object.entries(it.fields).sort(([a], [b]) => a.localeCompare(b))),
    });
  return {
    ...prune({ $schema: opts.schema === false ? null : PROJECT_FILE_SCHEMA_URL, format: PROJECT_FILE_FORMAT, version: PROJECT_FILE_VERSION, title: doc.title, uuid: doc.uuid }),
    // Always present, even empty: the schema requires it.
    lists: doc.lists.map((l) => prune({ id: l.id, name: l.name, items: l.items.map((it) => prune({ ...item(it), subitems: it.subitems.map(item) })) })),
  };
}

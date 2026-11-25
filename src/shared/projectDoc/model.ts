// The project document: one project as a file sees it, in every format Todoi reads and writes (Embridge
// Markdown, JSON, YAML). Import, export and Git sync all convert through this one model, so a format is
// only a codec (`parse` text → document, `serialize` document → text) and merging never touches text.
// Hierarchy: Project › Lists › Items › Subitems, no deeper (DESIGN.md › Storage & sync).
import { z } from "zod";

import { ITEM_PRIORITIES } from "../enums";
import { ITEM_STATUSES } from "../item-status";
import { isRealISODate } from "../dates";

const isoDate = z.string().refine(isRealISODate, "Use a real date written as YYYY-MM-DD");

export const docCommentSchema = z.object({
  /** Who wrote it, as the file names them (no "@") */
  author: z.string().nullable(),
  /** "2026-09-20" or "2026-09-20 14:30", as written */
  at: z.string().nullable(),
  text: z.string(),
  /** 1 = a comment, 2 = a reply to the comment above, … */
  depth: z.number().int().min(1),
});

export const docAttachmentSchema = z.object({
  label: z.string(),
  url: z.string().min(1),
  /** Written as an image (`![…](…)`) */
  image: z.boolean(),
});

const itemShape = {
  /** Stable id inside the file; null until the item is first written by a tool */
  id: z.string().min(1).nullable(),
  title: z.string().min(1),
  done: z.boolean(),
  status: z.enum(ITEM_STATUSES).nullable(),
  priority: z.enum(ITEM_PRIORITIES).nullable(),
  start: isoDate.nullable(),
  due: isoDate.nullable(),
  labels: z.array(z.string()),
  /** Names or handles, as the file writes them (no "@") */
  assignees: z.array(z.string()),
  description: z.string().nullable(),
  comments: z.array(docCommentSchema),
  attachments: z.array(docAttachmentSchema),
  /** Fields Todoi has no place for, kept verbatim so a round trip doesn't drop them */
  fields: z.record(z.string(), z.string()),
};

export const docSubitemSchema = z.object(itemShape);
export const docItemSchema = z.object({ ...itemShape, subitems: z.array(docSubitemSchema) });
export const docListSchema = z.object({
  id: z.string().min(1).nullable(),
  name: z.string().min(1),
  items: z.array(docItemSchema),
});
export const projectDocSchema = z.object({
  title: z.string(),
  /** The document's identity across copies (Embridge `uuid:`) */
  uuid: z.string().nullable(),
  lists: z.array(docListSchema),
});

export type DocComment = z.infer<typeof docCommentSchema>;
export type DocAttachment = z.infer<typeof docAttachmentSchema>;
export type DocSubitem = z.infer<typeof docSubitemSchema>;
export type DocItem = z.infer<typeof docItemSchema>;
export type DocList = z.infer<typeof docListSchema>;
export type ProjectDoc = z.infer<typeof projectDocSchema>;

/** A blank item with only a title: the starting point for codecs and tests. */
export const docSubitem = (title: string, over: Partial<DocSubitem> = {}): DocSubitem => ({
  id: null,
  title,
  done: false,
  status: null,
  priority: null,
  start: null,
  due: null,
  labels: [],
  assignees: [],
  description: null,
  comments: [],
  attachments: [],
  fields: {},
  ...over,
});
export const docItem = (title: string, over: Partial<DocItem> = {}): DocItem => ({ ...docSubitem(title), subitems: [], ...over });

/** What a codec hands back: the document plus what the reader should know (repairs, flattening, unreadable values). */
export interface DocParse {
  doc: ProjectDoc;
  warnings: string[];
}

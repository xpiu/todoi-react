// Request validation shared by the API and (type-only) by the client.
// Kept separate from `item-status.ts` so the browser bundle does not need zod.
import { z } from "zod";

import { isRealISODate } from "./dates";
import { ITEM_PRIORITIES, RELATION_TYPES } from "./enums";
import { ITEM_STATUSES } from "./item-status";

/** Ids are generated app-side (nanoid) so an optimistic insert already knows its final id. */
export const idSchema = z.string().regex(/^[A-Za-z0-9_-]{21}$/);
/** @deprecated use idSchema */
export const itemIdSchema = idSchema;

/** A calendar day that exists: "2026-02-28", never "2026-02-31" (which would roll into March). */
export const isoDateSchema = z.string().refine(isRealISODate, "Use a real date written as YYYY-MM-DD");
/** 24-hour "HH:MM", 00:00–23:59. */
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time from 00:00 to 23:59");

type DateFields = { startDate?: string | null; dueDate?: string | null; dueTime?: string | null };
/**
 * The rules an item's dates obey together: the start is on or before the due, and a time belongs to a due.
 * Checked on the request (create, or both fields in one update) and by the API against the stored item.
 */
export function dateRangeIssue({ startDate, dueDate, dueTime }: DateFields): { path: keyof DateFields; message: string } | null {
  if (startDate && dueDate && startDate > dueDate) return { path: "startDate", message: "The start date must be on or before the due date" };
  if (dueTime && dueDate === null) return { path: "dueTime", message: "A time needs a due date" };
  return null;
}
const checkDates = (v: DateFields, ctx: z.RefinementCtx) => {
  const issue = dateRangeIssue(v);
  if (issue) ctx.addIssue({ code: "custom", path: [issue.path], message: issue.message });
};

/** Recurrence rule, the shape RepeatPicker edits (src/client/design/core/repeat.ts). */
export const repeatRuleSchema = z.object({
  freq: z.enum(["daily", "weekly", "monthly", "yearly"]),
  interval: z.number().int().min(1).max(99).optional(),
  byWeekday: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  ends: z
    .discriminatedUnion("type", [
      z.object({ type: z.literal("never") }),
      z.object({ type: z.literal("on"), date: isoDateSchema.nullable() }),
      z.object({ type: z.literal("after"), count: z.number().int().min(1).max(999) }),
    ])
    .optional(),
});
export type RepeatRule = z.infer<typeof repeatRuleSchema>;

export const titleSchema = z.string().trim().min(1).max(500);

export const createItemSchema = z.object({
  id: idSchema,
  title: titleSchema,
  /** Destination list; defaults to the caller's Inbox when omitted */
  listId: idSchema.optional(),
  parentItemId: idSchema.optional(),
  status: z.enum(ITEM_STATUSES).nullable().optional(),
  priority: z.enum(ITEM_PRIORITIES).nullable().optional(),
  startDate: isoDateSchema.nullable().optional(),
  dueDate: isoDateSchema.nullable().optional(),
  dueTime: timeSchema.nullable().optional(),
  description: z.string().max(100_000).optional(),
  labelIds: z.array(idSchema).max(50).optional(),
  assigneeIds: z.array(z.string().min(1).max(64)).max(50).optional(),
  /** Where a top-level item goes among its list's items @default "bottom" (subitems always go last) */
  position: z.enum(["top", "bottom"]).optional(),
})
  .superRefine((v, ctx) => checkDates({ ...v, dueDate: v.dueDate ?? null }, ctx));
export type CreateItemInput = z.infer<typeof createItemSchema>;

export const updateItemSchema = z
  .object({
    title: titleSchema,
    description: z.string().max(100_000).nullable(),
    /** Set as given; Done means done (a recurring item does not move on — that is `done: true`) */
    status: z.enum(ITEM_STATUSES).nullable(),
    /** true completes: a recurring item with a due moves to its next occurrence; false reopens */
    done: z.boolean(),
    /** With done: complete only while this is still the due, so a retried request completes one occurrence */
    ifDue: isoDateSchema,
    priority: z.enum(ITEM_PRIORITIES).nullable(),
    startDate: isoDateSchema.nullable(),
    dueDate: isoDateSchema.nullable(),
    dueTime: timeSchema.nullable(),
    repeatRule: repeatRuleSchema.nullable(),
    /** Completed repeats so far (recurring completion advances it) */
    repeatCount: z.number().int().min(0),
    cover: z.object({ color: z.string().max(40).optional(), attachmentId: idSchema.optional(), sample: z.string().max(40).optional() }).nullable(),
    unread: z.boolean(),
    /** Order among siblings (subitem reorder) */
    position: z.number().int().min(0),
    /** Nest under another item (null = promote to a top-level item of its list) */
    parentItemId: idSchema.nullable(),
    /** Archive (true) or restore (false) */
    archived: z.boolean(),
    /** Restore from the Trash (false); true is what DELETE does */
    deleted: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" })
  .superRefine(checkDates);
export type UpdateItemInput = z.infer<typeof updateItemSchema>;

const userIdSchema = z.string().min(1).max(64);
/**
 * What a cross-project move took from the item family, handed back by its Undo. The server re-checks
 * every entry against the destination (family membership, members, same-project relations, free keys).
 */
export const moveRestoreSchema = z.object({
  keys: z.array(z.object({ itemId: idSchema, keyNumber: z.number().int().min(1) })).max(1000),
  labels: z.array(z.object({ itemId: idSchema, labelId: idSchema })).max(5000),
  assignees: z.array(z.object({ itemId: idSchema, userId: userIdSchema })).max(5000),
  watchers: z.array(z.object({ itemId: idSchema, userId: userIdSchema })).max(5000),
  relations: z.array(z.object({ itemId: idSchema, targetId: idSchema, type: z.enum(RELATION_TYPES) })).max(5000),
  /** Labels the move created in the project the family now leaves; removed again when unused */
  createdLabelIds: z.array(idSchema).max(1000),
  /** The parent a moved subitem left behind, to nest under again */
  parentItemId: idSchema.nullable().optional(),
});
export type MoveRestore = z.infer<typeof moveRestoreSchema>;

/** Move within or across lists (and projects): the list and the position among its siblings. */
export const moveItemSchema = z.object({
  listId: idSchema,
  /** Index among the destination list's top-level items; omitted = end */
  position: z.number().int().min(0).optional(),
  /** Undo of a cross-project move: the associations and keys to give back */
  restore: moveRestoreSchema.optional(),
});
export type MoveItemInput = z.infer<typeof moveItemSchema>;

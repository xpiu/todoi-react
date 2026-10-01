// Request validation shared by the API and (type-only) by the client.
// Kept separate from `item-status.ts` so the browser bundle does not need zod.
import { z } from "zod";

import { ITEM_PRIORITIES } from "./enums";
import { ITEM_STATUSES } from "./item-status";

/** Ids are generated app-side (nanoid) so an optimistic insert already knows its final id. */
export const idSchema = z.string().regex(/^[A-Za-z0-9_-]{21}$/);
/** @deprecated use idSchema */
export const itemIdSchema = idSchema;

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
export const timeSchema = z.string().regex(/^\d{2}:\d{2}$/, "HH:MM");

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
});
export type CreateItemInput = z.infer<typeof createItemSchema>;

export const updateItemSchema = z
  .object({
    title: titleSchema,
    description: z.string().max(100_000).nullable(),
    status: z.enum(ITEM_STATUSES).nullable(),
    done: z.boolean(),
    priority: z.enum(ITEM_PRIORITIES).nullable(),
    startDate: isoDateSchema.nullable(),
    dueDate: isoDateSchema.nullable(),
    dueTime: timeSchema.nullable(),
    repeatRule: repeatRuleSchema.nullable(),
    cover: z.object({ color: z.string().max(40).optional(), attachmentId: idSchema.optional() }).nullable(),
    unread: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });
export type UpdateItemInput = z.infer<typeof updateItemSchema>;

/** Move within or across lists (and projects): the list and the position among its siblings. */
export const moveItemSchema = z.object({
  listId: idSchema,
  /** Index among the destination list's top-level items; omitted = end */
  position: z.number().int().min(0).optional(),
});
export type MoveItemInput = z.infer<typeof moveItemSchema>;

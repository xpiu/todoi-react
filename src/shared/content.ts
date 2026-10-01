// Request validation for what hangs off an item: labels, assignees, watchers, comments, relations,
// saved views. Shared by the API and (type-only) the client.
import { z } from "zod";

import { LABEL_COLORS, PROJECT_VIEWS, RELATION_TYPES } from "./enums";
import { idSchema } from "./items";

export const createLabelSchema = z.object({ id: idSchema, projectId: idSchema, name: z.string().trim().min(1).max(60), color: z.enum(LABEL_COLORS) });
export const updateLabelSchema = z
  .object({ name: z.string().trim().min(1).max(60), color: z.enum(LABEL_COLORS), position: z.number().int().min(0) })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });
/** Replace the item's label set */
export const setItemLabelsSchema = z.object({ labelIds: z.array(idSchema).max(50) });
/** Merge this label into another: items keep one label, the source is removed */
export const mergeLabelSchema = z.object({ intoLabelId: idSchema });

export const setAssigneesSchema = z.object({ userIds: z.array(z.string().min(1).max(64)).max(50) });
export const setWatchingSchema = z.object({ watching: z.boolean() });

export const createCommentSchema = z.object({ id: idSchema, body: z.string().trim().min(1).max(20_000), replyToId: idSchema.optional() });
export const updateCommentSchema = z.object({ body: z.string().trim().min(1).max(20_000) });
export const reactSchema = z.object({ emoji: z.string().min(1).max(16) });

export const relationSchema = z.object({ targetId: idSchema, type: z.enum(RELATION_TYPES) });

export const viewDefinitionSchema = z.object({
  view: z.enum(PROJECT_VIEWS).optional(),
  filters: z.array(z.object({ type: z.string().max(40), value: z.string().max(200) })).max(50).optional(),
  sort: z
    .object({
      lists: z.object({ key: z.string().max(40), dir: z.enum(["asc", "desc"]) }).nullable().optional(),
      items: z.object({ key: z.string().max(40), dir: z.enum(["asc", "desc"]) }).nullable().optional(),
    })
    .optional(),
});
export type ViewDefinitionInput = z.infer<typeof viewDefinitionSchema>;
export const createSavedViewSchema = z.object({ id: idSchema, projectId: idSchema, name: z.string().trim().min(1).max(80), shared: z.boolean().optional(), definition: viewDefinitionSchema });
export const updateSavedViewSchema = z
  .object({ name: z.string().trim().min(1).max(80), shared: z.boolean(), definition: viewDefinitionSchema, position: z.number().int().min(0) })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

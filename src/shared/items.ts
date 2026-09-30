// Request validation shared by the API and (type-only) by the client.
// Kept separate from `item-status.ts` so the browser bundle does not need zod.
import { z } from "zod";

import { ITEM_STATUSES } from "./item-status";

/** Ids are generated app-side (nanoid) so an optimistic insert already knows its final id. */
export const itemIdSchema = z.string().regex(/^[A-Za-z0-9_-]{21}$/);

export const createItemSchema = z.object({
  id: itemIdSchema,
  title: z.string().trim().min(1).max(500),
});
export type CreateItemInput = z.infer<typeof createItemSchema>;

export const updateItemSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    status: z.enum(ITEM_STATUSES),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });
export type UpdateItemInput = z.infer<typeof updateItemSchema>;

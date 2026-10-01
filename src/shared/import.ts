// The import plan: what the client's parsers (Markdown, Trello, CSV) produce and the Review step shows,
// sent as one request so the server creates the project, lists, labels, items and subitems in a
// single transaction. Spec: DESIGN.md › Storage & sync › Import.
import { z } from "zod";

import { ITEM_PRIORITIES, LABEL_COLORS } from "./enums";
import { ITEM_STATUSES } from "./item-status";
import { idSchema, isoDateSchema, titleSchema } from "./items";
import { name } from "./projects";

export const planItemSchema = z.object({
  title: titleSchema,
  description: z.string().max(100_000).optional(),
  due: isoDateSchema.nullable().optional(),
  labels: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
  assignee: z.string().max(120).nullable().optional(),
  priority: z.enum(ITEM_PRIORITIES).nullable().optional(),
  done: z.boolean().default(false),
  subitems: z.array(z.object({ title: titleSchema, done: z.boolean().default(false) })).max(500).default([]),
});
export const planListSchema = z.object({
  name,
  statusRole: z.enum(ITEM_STATUSES).nullable().optional(),
  items: z.array(planItemSchema).max(5000),
});
export const importPlanSchema = z.object({
  name: z.string().max(120),
  description: z.string().max(5000).optional(),
  lists: z.array(planListSchema).max(50),
  labels: z.array(z.object({ name: z.string().trim().min(1).max(60), color: z.enum(LABEL_COLORS).optional() })).max(100),
  warnings: z.array(z.string()).default([]),
});
export type PlanItem = z.infer<typeof planItemSchema>;
export type PlanList = z.infer<typeof planListSchema>;
export type ImportPlan = z.infer<typeof importPlanSchema>;

export const importProjectSchema = z.object({
  id: idSchema,
  groupId: idSchema,
  name,
  plan: importPlanSchema,
});
export type ImportProjectInput = z.infer<typeof importProjectSchema>;

// The import plan: what the client's parsers (Markdown, Trello, CSV) produce and the Review step shows,
// sent as one request so the server creates the project, lists, labels, items and subitems in a
// single transaction. Spec: DESIGN.md › Storage & sync › Import.
import { z } from "zod";

import { ITEM_PRIORITIES, LABEL_COLORS } from "./enums";
import { ITEM_STATUSES } from "./item-status";
import { dateRangeIssue, idSchema, isoDateSchema, titleSchema } from "./items";
import { name } from "./projects";

/** A comment from the file, written by the person importing; `author`/`at` say who wrote it there and when. */
export const planCommentSchema = z.object({
  text: z.string().trim().min(1).max(20_000),
  author: z.string().max(120).nullable().optional(),
  at: z.string().max(40).nullable().optional(),
  /** 1 = a comment, 2+ = a reply to the nearest shallower comment above */
  depth: z.number().int().min(1).max(20).default(1),
});
export const planSubitemSchema = z.object({
  title: titleSchema,
  done: z.boolean().default(false),
  description: z.string().max(100_000).optional(),
  comments: z.array(planCommentSchema).max(200).optional(),
});
export const planItemSchema = z
  .object({
    title: titleSchema,
    description: z.string().max(100_000).optional(),
    start: isoDateSchema.nullable().optional(),
    due: isoDateSchema.nullable().optional(),
    labels: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
    assignee: z.string().max(120).nullable().optional(),
    priority: z.enum(ITEM_PRIORITIES).nullable().optional(),
    /** The item's own Status; null or absent = its list's role */
    status: z.enum(ITEM_STATUSES).nullable().optional(),
    done: z.boolean().default(false),
    comments: z.array(planCommentSchema).max(200).optional(),
    subitems: z.array(planSubitemSchema).max(500).default([]),
  })
  .superRefine((v, ctx) => {
    const issue = dateRangeIssue({ startDate: v.start, dueDate: v.due });
    if (issue) ctx.addIssue({ code: "custom", path: ["start"], message: issue.message });
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
export type PlanComment = z.infer<typeof planCommentSchema>;
export type PlanSubitem = z.infer<typeof planSubitemSchema>;
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

/** An imported comment's body: who wrote it in the file and when, above the text, so nothing is lost. */
export function importedCommentBody(c: Pick<PlanComment, "text" | "author" | "at">): string {
  const by = [c.author && `**${c.author}**`, c.at].filter(Boolean).join(" · ");
  return by ? `${by}\n\n${c.text}` : c.text;
}

// Request validation for groups, projects and lists (API + type-only on the client).
import { z } from "zod";

import { LABEL_COLORS, MEMBER_ROLES, PROJECT_VIEWS, PROJECT_VISIBILITIES } from "./enums";
import { ITEM_STATUSES } from "./item-status";
import { idSchema } from "./items";

const name = z.string().trim().min(1).max(120);
/** Item-key prefix: 2–5 uppercase letters or digits ("MP", "SAL") */
export const keyPrefixSchema = z.string().regex(/^[A-Z0-9]{2,5}$/, "2–5 uppercase letters or digits");

export const createGroupSchema = z.object({ id: idSchema, name, keyPrefix: keyPrefixSchema, icon: z.string().max(40).optional() });
export const updateGroupSchema = z
  .object({ name, icon: z.string().max(40).nullable(), keyPrefix: keyPrefixSchema, position: z.number().int().min(0) })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;

/** A template seeds lists: [name, statusRole?] */
export const templateListSchema = z.tuple([name, z.enum(ITEM_STATUSES).nullable().optional()]);

export const createProjectSchema = z.object({
  id: idSchema,
  groupId: idSchema,
  name,
  icon: z.string().max(40).optional(),
  color: z.enum(LABEL_COLORS).optional(),
  visibility: z.enum(PROJECT_VISIBILITIES).optional(),
  /** Lists to seed from a template; ignored when copyFrom is given */
  lists: z.array(templateListSchema).max(20).optional(),
  /** Copy lists and settings (never items) from this project */
  copyFrom: idSchema.optional(),
});
export const updateProjectSchema = z
  .object({
    name,
    icon: z.string().max(40).nullable(),
    color: z.enum(LABEL_COLORS).nullable(),
    description: z.string().max(5000).nullable(),
    visibility: z.enum(PROJECT_VISIBILITIES),
    defaultView: z.enum(PROJECT_VIEWS),
    linkStatuses: z.boolean(),
    groupId: idSchema,
    position: z.number().int().min(0),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });
export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const createListSchema = z.object({ id: idSchema, projectId: idSchema, name, statusRole: z.enum(ITEM_STATUSES).nullable().optional(), icon: z.string().max(40).optional() });
export const updateListSchema = z
  .object({
    name,
    icon: z.string().max(40).nullable(),
    statusRole: z.enum(ITEM_STATUSES).nullable(),
    /** With a statusRole change: also rewrite the Status of the items already in the list (the RoleReviewDialog's "Apply to existing items") */
    applyToExisting: z.boolean(),
    position: z.number().int().min(0),
    hidden: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });
export type CreateListInput = z.infer<typeof createListSchema>;
export type UpdateListInput = z.infer<typeof updateListSchema>;

export const memberRoleSchema = z.enum(MEMBER_ROLES);

/** The built-in "Start from" templates (DESIGN.md › Project lifecycle). */
export const PROJECT_TEMPLATES = [
  { id: "blank", name: "Blank", hint: "No lists yet", lists: [] as Array<[string, (typeof ITEM_STATUSES)[number]?]> },
  { id: "simple", name: "To-do, Doing, Done", hint: "To-do · Doing · Done", lists: [["To-do", "TODO"], ["Doing", "DOING"], ["Done", "DONE"]] as Array<[string, (typeof ITEM_STATUSES)[number]?]> },
  { id: "intake", name: "Intake", hint: "New · To-do · Doing · Done · Backlog", lists: [["New", "NEW"], ["To-do", "TODO"], ["Doing", "DOING"], ["Done", "DONE"], ["Backlog", "BACKLOG"]] as Array<[string, (typeof ITEM_STATUSES)[number]?]> },
  { id: "weekly", name: "Weekly plan", hint: "This week · Next week · Later · Done", lists: [["This week", "TODO"], ["Next week"], ["Later", "BACKLOG"], ["Done", "DONE"]] as Array<[string, (typeof ITEM_STATUSES)[number]?]> },
] as const;

/** "Helicopters Europe" → "HE", "Sales" → "SAL": the key-prefix suggestion for a new group. */
export function suggestKeyPrefix(groupName: string): string {
  const words = groupName
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "";
  const initials = words.map((w) => w[0]!).join("");
  const out = words.length >= 2 ? initials : words[0]!.slice(0, 3);
  return out.slice(0, 5).padEnd(2, "X");
}

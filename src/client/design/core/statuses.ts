// Canonical Status registry for the client. Ids come from src/shared/item-status.ts (the Postgres enum);
// names are display copy and may be renamed without breaking links. Spec: DESIGN.md › Lists & Status linking.
import { type ItemStatus } from "../../../shared/item-status";
import type { IconName } from "./Icon";

export interface StatusDef {
  id: ItemStatus;
  name: string;
  icon: IconName;
  /** CSS colour (token) for the glyph; neutral when absent */
  color?: string;
}

export const STATUSES: ReadonlyArray<StatusDef> = [
  { id: "NEW", name: "New", icon: "circle-dashed" },
  { id: "BACKLOG", name: "Backlog", icon: "archive" },
  { id: "TODO", name: "To-do", icon: "circle-todo" },
  { id: "DOING", name: "Doing", icon: "circle-dot", color: "var(--label-blue)" },
  { id: "DONE", name: "Done", icon: "circle-check", color: "var(--success-icon)" },
];

export const statusById = (id: string | null | undefined): StatusDef | null => STATUSES.find((s) => s.id === id) ?? null;
export const statusByName = (name: string): StatusDef | null => STATUSES.find((s) => s.name === name) ?? null;

export type StatusLike = string | { id?: string; name: string; icon?: IconName; color?: string };

/** A stable id, a display name, or a status object → the display shape (unknown strings become a neutral circle). */
export function resolveStatus(v: StatusLike | null | undefined): { id?: string; name: string; icon: IconName; color?: string } | null {
  if (v == null) return null;
  if (typeof v === "string") return statusById(v) ?? statusByName(v) ?? { name: v, icon: "circle" };
  return { ...v, icon: v.icon ?? "circle" };
}

/** Title-matching SUGGESTION for prefilling a list's Status role picker. Never a live link: roles are stored by id. */
export function suggestedRoleForTitle(title: string | null | undefined): ItemStatus | null {
  const t = title ?? "";
  if (/backlog|icebox|later|someday|parked/i.test(t)) return "BACKLOG";
  if (/done|complete|finish|shipped|closed|launched/i.test(t)) return "DONE";
  if (/doing|progress|ongoing|wip|active/i.test(t)) return "DOING";
  if (/to.?do\b|\bready\b|up next|next up|queued/i.test(t)) return "TODO";
  if (/\bnew\b|inbox|incoming|request|triage|idea/i.test(t)) return "NEW";
  return null;
}

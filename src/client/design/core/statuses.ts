// Canonical Status registry for the client. Ids come from src/shared/item-status.ts (the Postgres enum);
// names are display copy and may be renamed without breaking links. Spec: DESIGN.md › Lists & Status linking.
import { STATUS_NAMES, suggestedRoleForTitle, type ItemStatus } from "../../../shared/item-status";

export { suggestedRoleForTitle };
import type { IconName } from "./Icon";

export interface StatusDef {
  id: ItemStatus;
  name: string;
  icon: IconName;
  /** CSS colour (token) for the glyph; neutral when absent */
  color?: string;
}

export const STATUSES: ReadonlyArray<StatusDef> = [
  { id: "NEW", name: STATUS_NAMES.NEW, icon: "circle-dashed" },
  { id: "BACKLOG", name: STATUS_NAMES.BACKLOG, icon: "archive" },
  { id: "TODO", name: STATUS_NAMES.TODO, icon: "circle-todo" },
  { id: "DOING", name: STATUS_NAMES.DOING, icon: "circle-dot", color: "var(--label-blue)" },
  { id: "DONE", name: STATUS_NAMES.DONE, icon: "circle-check", color: "var(--success-icon)" },
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

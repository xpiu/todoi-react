/** Stable status ids. Mirrors the Postgres enum in the schema. */
export const ITEM_STATUSES = ["NEW", "BACKLOG", "TODO", "DOING", "DONE"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];
/** Display names: the client's Status registry and the server's activity text ("— Status set to Doing") */
export const STATUS_NAMES: Record<ItemStatus, string> = { NEW: "New", BACKLOG: "Backlog", TODO: "To-do", DOING: "Doing", DONE: "Done" };

/** Title-matching SUGGESTION: prefills a list's Status role picker and reads Status words in imported files. Never a live link: roles are stored by id. */
export function suggestedRoleForTitle(title: string | null | undefined): ItemStatus | null {
  const t = title ?? "";
  // A just-added list's placeholder name ("List 3" in the app, "New list" / "New list 2" elsewhere) is not the New
  // status: no role, so Colorize gives it a pool tint and the Status role picker suggests nothing.
  if (/^\s*(?:new\s+)?list(?:\s+\d+)?\s*$/i.test(t)) return null;
  if (/backlog|icebox|later|someday|parked/i.test(t)) return "BACKLOG";
  if (/done|complete|finish|shipped|closed|launched/i.test(t)) return "DONE";
  if (/doing|progress|ongoing|wip|active/i.test(t)) return "DOING";
  if (/to.?do\b|\bready\b|up next|next up|queued/i.test(t)) return "TODO";
  if (/\bnew\b|inbox|incoming|request|triage|idea/i.test(t)) return "NEW";
  return null;
}

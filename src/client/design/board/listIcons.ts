// Automatic list icons: the glyph a list gets from its name (DESIGN.md › Lists & Status linking).
// Never a live Status link — that is the explicit statusRole; this only picks the glyph.
import type { IconName } from "../core/Icon";

const RULES: ReadonlyArray<[RegExp, IconName, string]> = [
  [/done|complete|finish|shipped|closed|launched/i, "circle-check", "var(--success-icon)"],
  [/review|\bqa\b|test|verify|approv/i, "circle-ellipsis", "var(--label-orange)"],
  [/block|stuck/i, "circle-alert", "var(--danger)"],
  [/hold|wait|pause/i, "circle-pause", "var(--label-orange)"],
  [/doing|progress|ongoing|wip|active/i, "circle-dot", "var(--blue-500)"],
  [/backlog|icebox|later|someday|parked/i, "archive", "var(--ink-300)"],
  [/to.?do\b|ready|queued|up next|next up/i, "circle-todo", "var(--ink-300)"],
  [/new|inbox|incoming|request|triage|idea/i, "circle-dashed", "var(--ink-300)"],
  [/cancel|archive|dropped|won'?t/i, "circle-x", "var(--ink-300)"],
];

export interface ListIcon {
  icon: IconName;
  color: string;
}

export function listIconFor(name: string | null | undefined): ListIcon {
  for (const [re, icon, color] of RULES) if (re.test(name ?? "")) return { icon, color };
  return { icon: "circle", color: "var(--ink-300)" };
}

// StatusChip — hidden by default on items; visibility follows the per-user "Show Status on items"
// preference (appearance.statusDisplay), never grouping. Contract: components/core/StatusChip.d.ts.
import type { CSSProperties } from "react";

import { Icon } from "./Icon";
import { resolveStatus, type StatusLike } from "./statuses";
import "./StatusChip.css";

export interface StatusChipProps {
  /** Stable id ("DOING"), display name ("Doing"), or {id?, name, icon?, color?} */
  status: StatusLike;
  /** Icon only, name moves to the title tooltip @default false */
  iconOnly?: boolean;
  /** @default "md" (14px icon / 12px text); "sm" is 13px / 11px */
  size?: "sm" | "md";
  style?: CSSProperties;
  className?: string;
}

export function StatusChip({ status, iconOnly, size = "md", style, className }: StatusChipProps) {
  const s = resolveStatus(status) ?? { name: "", icon: "circle" as const };
  return (
    <span className={["td-status", size === "sm" ? "td-status-sm" : "", className ?? ""].filter(Boolean).join(" ")} title={iconOnly ? s.name : undefined} style={style}>
      <Icon name={s.icon} size={size === "sm" ? 13 : 14} color={s.color ?? "var(--ink-400)"} />
      {iconOnly ? null : s.name}
    </span>
  );
}

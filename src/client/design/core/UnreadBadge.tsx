// UnreadBadge — the Inbox unread count: a 16px action-blue pill or a 6px dot. Nothing at zero.
import type { CSSProperties } from "react";

import "./UnreadBadge.css";

export interface UnreadBadgeProps {
  count?: number;
  /** @default 99 — larger counts read "99+" */
  max?: number;
  /** A 6px dot instead of the number (sidebar row) */
  dot?: boolean;
  label?: string;
  style?: CSSProperties;
  className?: string;
}

export function UnreadBadge({ count, max = 99, dot, label, style, className }: UnreadBadgeProps) {
  const n = Math.max(0, Number(count) || 0);
  const show = dot ? count === undefined || n > 0 : n > 0;
  if (!show) return null;
  const text = n > max ? `${max}+` : String(n);
  return (
    <span className={["td-unread", className ?? ""].join(" ").trim()} data-dot={dot ? "true" : undefined} role="img" aria-label={label ?? (n > 0 ? `${text} unread` : "Unread")} style={style}>
      {dot ? null : text}
    </span>
  );
}

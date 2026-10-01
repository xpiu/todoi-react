// DueDatePill — "Sep 12, 2026" with a clock; green when complete, red when overdue, quiet otherwise.
// The Minimal theme shows dates without the current year ("Oct 3").
import type { CSSProperties } from "react";

import { useAppearanceStore } from "../core/appearance";
import { Icon } from "../core/Icon";
import "./DueDatePill.css";

export type DueState = "default" | "overdue" | "complete";

export interface DueDatePillProps {
  /** Display text, e.g. "Jan 10, 2020" */
  date: string;
  /** @default "default" */
  state?: DueState;
  className?: string;
  style?: CSSProperties;
}

const shortDate = (d: string) => {
  const m = /^([A-Za-z]{3}) (\d{1,2}), (\d{4})$/.exec(d);
  return m && Number(m[3]) === new Date().getFullYear() ? `${m[1]} ${m[2]}` : d;
};

export function DueDatePill({ date, state = "default", className, style }: DueDatePillProps) {
  const minimal = useAppearanceStore((s) => s.theme) === "minimal";
  return (
    <span className={["td-due", className ?? ""].join(" ").trim()} data-state={state} title={date} style={style}>
      <Icon name="clock" size={14} />
      <span className="td-meta-text">{minimal ? shortDate(date) : date}</span>
    </span>
  );
}

// DueDatePill — a date with a clock; green when complete, red when overdue, quiet otherwise.
// The year is dropped while it is the current year ("Oct 3"); the full date stays in the hint.
import type { CSSProperties } from "react";

import { formatDate, parseDateValue, type DateInput } from "../core/dates";
import { Icon } from "../core/Icon";
import "./DueDatePill.css";

export type DueState = "default" | "overdue" | "complete";

export interface DueDatePillProps {
  /** The due date (ISO "2026-09-12", a Date, or formatDate's full text) — or display text such as "Tomorrow", shown as is */
  date: string | Date;
  /** Decides which year counts as the current one @default now */
  today?: DateInput;
  /** @default "default" */
  state?: DueState;
  className?: string;
  style?: CSSProperties;
}

/** Text and tooltip: a date in the person's format (the text drops the year inside the current one), other copy verbatim. */
function dueText(date: string | Date, today: DateInput): { text: string; full: string } {
  const d = parseDateValue(date);
  const full = d ? formatDate(d) : "";
  // Only a real date (a Date, ISO, or formatDate's own text) is re-formatted; "Tomorrow" is the caller's copy.
  if (!d || (typeof date === "string" && !/^\d{4}-\d{1,2}-\d{1,2}/.test(date) && full !== date)) return { text: String(date), full: String(date) };
  return { text: formatDate(d, { year: "auto", today }), full };
}

export function DueDatePill({ date, today, state = "default", className, style }: DueDatePillProps) {
  const { text, full } = dueText(date, today);
  return (
    <span className={["td-due", className ?? ""].join(" ").trim()} data-state={state} title={full} style={style}>
      <Icon name="clock" size={14} />
      <span className="td-meta-text">{text}</span>
    </span>
  );
}

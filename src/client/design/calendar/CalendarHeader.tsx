// CalendarHeader — period title, Today, previous / next, and the period Select on the toolbar tier.
import type { CSSProperties, ReactNode } from "react";

import { Button } from "../core/Button";
import { IconButton } from "../core/IconButton";
import { Select } from "../core/Select";
import type { CalendarPeriod } from "./calendar";
import "./CalendarHeader.css";

const PERIODS: Array<{ value: CalendarPeriod; label: string }> = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

export interface CalendarHeaderProps {
  title: string;
  period: CalendarPeriod;
  onPeriodChange?: (p: CalendarPeriod) => void;
  onPrev?: () => void;
  onNext?: () => void;
  onToday?: () => void;
  extra?: ReactNode;
  style?: CSSProperties;
}

export function CalendarHeader({ title, period, onPeriodChange, onPrev, onNext, onToday, extra, style }: CalendarHeaderProps) {
  return (
    <div className="td-calendar-header" style={style}>
      <h2 className="td-calendar-header-title">{title}</h2>
      {/* The controls are one group pushed to the right edge: when the title and the group do not fit one row (a week range or a day title on a phone), the group wraps under the title as a whole instead of the title being cut. */}
      <div className="td-calendar-header-controls">
        {extra}
        {onToday ? (
          <Button variant="chrome" onClick={onToday}>
            Today
          </Button>
        ) : null}
        {onPrev ? <IconButton name="chevron-left" label={`Previous ${period}`} variant="chrome" onClick={onPrev} /> : null}
        {onNext ? <IconButton name="chevron-right" label={`Next ${period}`} variant="chrome" onClick={onNext} /> : null}
        {onPeriodChange ? <Select variant="chrome" aria-label="Calendar period" value={period} options={PERIODS} onChange={(v) => onPeriodChange(v)} placement="bottom-end" tier="toolbar" width={132} /> : null}
      </div>
    </div>
  );
}

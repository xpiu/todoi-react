// CalendarMiniMonth — one month tile of the year view: weekday initials, day numbers, a dot under
// days that carry items, today in action blue. The whole tile opens that month.
import type { CSSProperties } from "react";

import { parseDateValue, sameDay, toISO } from "./calendar";
import "./CalendarMiniMonth.css";

export interface CalendarMiniMonthProps {
  year: number;
  month: number;
  /** ISO dates that carry at least one item */
  dates?: Set<string>;
  today: Date | string;
  weekStartsOn?: number;
  onOpen?: () => void;
  style?: CSSProperties;
}

export function CalendarMiniMonth({ year, month, dates, today, weekStartsOn = 1, onOpen, style }: CalendarMiniMonthProps) {
  const first = new Date(year, month, 1);
  const daysIn = new Date(year, month + 1, 0).getDate();
  const lead = (first.getDay() - weekStartsOn + 7) % 7;
  const todayD = parseDateValue(today)!;
  const name = first.toLocaleDateString("en-US", { month: "long" });
  const wd = Array.from({ length: 7 }, (_, i) => "SMTWTFS"[(weekStartsOn + i) % 7]);
  const cells: Array<Date | null> = [...Array.from({ length: lead }, () => null), ...Array.from({ length: daysIn }, (_, i) => new Date(year, month, i + 1))];
  return (
    <button type="button" className="td-calmini" style={style} aria-label={`${name} ${year}`} onClick={onOpen}>
      <span className="td-calmini-name">{name}</span>
      <span className="td-calmini-grid" aria-hidden>
        {wd.map((c, i) => (
          <span key={`w${i}`} className="td-calmini-wd">
            {c}
          </span>
        ))}
        {cells.map((d, i) =>
          d ? (
            <span key={i} className={"td-calmini-day" + (sameDay(d, todayD) ? " is-today" : "")}>
              <span className="td-calmini-n">{d.getDate()}</span>
              {dates?.has(toISO(d)!) ? <span className="td-calmini-dot" /> : null}
            </span>
          ) : (
            <span key={i} />
          ),
        )}
      </span>
    </button>
  );
}

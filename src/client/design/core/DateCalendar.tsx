// DateCalendar — the month grid alone (embed in a picker panel). 7×32px days, today ringed, picked day
// filled action blue, arrow keys move the focused day, PageUp/PageDown change month, Enter picks.
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";

import { addDays, dateConventions, formatDate, parseDateValue, sameDay, toISO, type DateInput } from "./dates";
import { IconButton } from "./IconButton";
import "./DatePicker.css";

const WD = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
export type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface DateCalendarProps {
  value?: DateInput;
  /** (iso, date) when a day is picked */
  onChange?: (iso: string, date: Date) => void;
  /** Fix "today" for previews and tests (ISO). Default: the real date */
  today?: DateInput;
  /** 0 = Sunday, 1 = Monday (default). Wire to the "Week starts on" setting */
  weekStartsOn?: WeekStart;
  min?: DateInput;
  max?: DateInput;
  /** Shade the days between start and end (DatesPicker) */
  range?: { start: DateInput; end: DateInput } | null;
  style?: CSSProperties;
  className?: string;
}

export function DateCalendar({ value, onChange, today, weekStartsOn = dateConventions().weekStart, min, max, range, style, className }: DateCalendarProps) {
  const sel = parseDateValue(value);
  // The real "today" is read once per mount; `today` (tests, previews) overrides it.
  const [realToday] = useState(() => parseDateValue(new Date())!);
  const tod = parseDateValue(today) ?? realToday;
  const mn = parseDateValue(min);
  const mx = parseDateValue(max);
  const rs = range ? parseDateValue(range.start) : null;
  const re = range ? parseDateValue(range.end) : null;
  const selIso = toISO(sel);
  const [view, setView] = useState(() => {
    const b = sel ?? tod;
    return new Date(b.getFullYear(), b.getMonth(), 1);
  });
  const [pending, setPending] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const lastSel = useRef(selIso);
  useEffect(() => {
    // A new selection from outside moves the view to its month.
    if (selIso && selIso !== lastSel.current) {
      const d = parseDateValue(selIso)!;
      setView(new Date(d.getFullYear(), d.getMonth(), 1));
    }
    lastSel.current = selIso;
  }, [selIso]);
  useEffect(() => {
    // `pending` is set together with the view change, so the cell exists by the time this runs.
    if (pending && gridRef.current) {
      gridRef.current.querySelector<HTMLElement>(`[data-date="${pending}"]`)?.focus();
      setPending(null);
    }
  }, [pending]);

  const first = new Date(view);
  const shift = (first.getDay() - weekStartsOn + 7) % 7;
  const start = addDays(first, -shift);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const disabled = (d: Date) => (!!mn && d < mn) || (!!mx && d > mx);
  const go = (d: Date) => {
    setView(new Date(d.getFullYear(), d.getMonth(), 1));
    setPending(toISO(d));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const cur = (e.target as HTMLElement).getAttribute?.("data-date");
    if (!cur) return;
    const d = parseDateValue(cur)!;
    let n: Date | null = null;
    if (e.key === "ArrowLeft") n = addDays(d, -1);
    else if (e.key === "ArrowRight") n = addDays(d, 1);
    else if (e.key === "ArrowUp") n = addDays(d, -7);
    else if (e.key === "ArrowDown") n = addDays(d, 7);
    else if (e.key === "Home") n = addDays(d, -((d.getDay() - weekStartsOn + 7) % 7));
    else if (e.key === "End") n = addDays(d, 6 - ((d.getDay() - weekStartsOn + 7) % 7));
    else if (e.key === "PageUp" || e.key === "PageDown") {
      n = new Date(d);
      n.setMonth(n.getMonth() + (e.key === "PageUp" ? -1 : 1));
    }
    if (n) {
      e.preventDefault();
      e.stopPropagation();
      go(n);
    }
  };
  const title = view.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  return (
    <div className={["td-cal", className ?? ""].join(" ").trim()} style={style}>
      <div className="td-cal-head">
        <IconButton name="chevron-left" label="Previous month" size={28} iconSize={16} onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))} />
        <span className="td-cal-title" aria-live="polite">
          {title}
        </span>
        <IconButton name="chevron-right" label="Next month" size={28} iconSize={16} onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))} />
      </div>
      <div className="td-cal-week" aria-hidden>
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} className="td-cal-wd">
            {WD[(weekStartsOn + i) % 7]}
          </span>
        ))}
      </div>
      <div ref={gridRef} className="td-cal-grid" role="grid" aria-label={title} onKeyDown={onKeyDown}>
        {cells.map((d) => {
          const iso = toISO(d)!;
          const out = d.getMonth() !== view.getMonth();
          const dis = disabled(d);
          const isSel = sameDay(d, sel);
          const inR = !!rs && !!re && d > rs && d < re;
          const edge = rs && re && !sameDay(rs, re) ? (sameDay(d, rs) ? "start" : sameDay(d, re) ? "end" : undefined) : undefined;
          return (
            <button
              key={iso}
              type="button"
              className="td-cal-day"
              data-date={iso}
              data-outside={out ? "true" : undefined}
              data-today={sameDay(d, tod) ? "true" : undefined}
              data-disabled={dis ? "true" : undefined}
              data-in-range={inR ? "true" : undefined}
              data-range-edge={edge}
              aria-pressed={isSel ? "true" : undefined}
              aria-label={formatDate(d, { weekday: true })}
              tabIndex={isSel || (!sel && sameDay(d, tod)) ? 0 : -1}
              onClick={() => {
                if (!dis) onChange?.(iso, d);
              }}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

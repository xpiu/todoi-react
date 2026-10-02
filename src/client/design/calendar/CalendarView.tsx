// CalendarView — header + body for the period: month / week grid, day list, or the year's twelve
// mini months. The period is controlled (the URL or the screen owns it) or self-managed.
// ←/→ outside the grid and PageUp/PageDown move the period. Spec: DESIGN.md › Views › Calendar.
import { useMemo, useState, type CSSProperties, type KeyboardEvent } from "react";

import { addDays, coversDay, parseDateValue, periodTitle, shiftPeriod, toISO, type CalendarItem, type CalendarPeriod } from "./calendar";
import { dateConventions } from "../core/dates";
import { CalendarDayList } from "./CalendarDayList";
import { CalendarGrid } from "./CalendarGrid";
import { CalendarHeader } from "./CalendarHeader";
import { CalendarMiniMonth } from "./CalendarMiniMonth";
import "./CalendarView.css";

const DAY = 864e5;

export interface CalendarViewProps {
  items: CalendarItem[];
  period?: CalendarPeriod;
  defaultPeriod?: CalendarPeriod;
  onPeriodChange?: (p: CalendarPeriod) => void;
  /** Initial cursor date */
  date?: string | Date;
  today?: string | Date;
  weekStartsOn?: number;
  showItemIds?: boolean;
  showLabels?: boolean;
  onOpenItem?: (id: string) => void;
  onAddItem?: (iso: string) => void;
  onReschedule?: (id: string, iso: string) => void;
  onToggleDone?: (id: string, done: boolean) => void;
  onToggleSubitem?: (itemId: string, subitemId: string, done: boolean) => void;
  style?: CSSProperties;
  className?: string;
}

export function CalendarView({ items, period: periodProp, defaultPeriod = "month", onPeriodChange, date, today, weekStartsOn = dateConventions().weekStart, showItemIds = true, showLabels = true, onOpenItem, onAddItem, onReschedule, onToggleDone, onToggleSubitem, style, className }: CalendarViewProps) {
  const controlled = periodProp != null;
  const [selfP, setSelfP] = useState<CalendarPeriod>(defaultPeriod);
  const period = controlled ? periodProp : selfP;
  // Today is sampled once per mount (a pure render must not read the clock).
  const [now] = useState(() => parseDateValue(new Date())!);
  const todayD = parseDateValue(today) ?? now;
  const [cursor, setCursor] = useState<Date>(() => parseDateValue(date) ?? todayD);
  const [focusIso, setFocusIso] = useState<string | null>(null);
  const setPeriod = (p: CalendarPeriod) => {
    onPeriodChange?.(p);
    if (!controlled) setSelfP(p);
  };
  const shift = (n: number) => {
    setFocusIso(null);
    setCursor((c) => shiftPeriod(c, period, n));
  };
  const goToday = () => {
    setFocusIso(toISO(todayD));
    setCursor(todayD);
  };
  const openDay = (iso: string) => {
    setCursor(parseDateValue(iso)!);
    setFocusIso(null);
    setPeriod("day");
  };
  const navigateDate = (iso: string) => {
    setCursor(parseDateValue(iso)!);
    setFocusIso(iso);
  };
  const Y = cursor.getFullYear();
  const yearDates = useMemo(() => {
    const s = new Set<string>();
    for (const it of items) {
      const due = parseDateValue(it.due), st = parseDateValue(it.start);
      if (st && due && due.getTime() - st.getTime() >= DAY && due.getTime() - st.getTime() < 200 * DAY) {
        for (let d = new Date(st); d <= due; d = addDays(d, 1)) if (d.getFullYear() === Y) s.add(toISO(d)!);
      } else if (due && due.getFullYear() === Y) s.add(toISO(due)!);
    }
    return s;
  }, [items, Y]);
  const onRootKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "PageUp") {
      e.preventDefault();
      shift(-1);
      return;
    }
    if (e.key === "PageDown") {
      e.preventDefault();
      shift(1);
      return;
    }
    if ((e.target as HTMLElement).closest('[role="gridcell"],.td-calweek,input,textarea,select,[contenteditable="true"]')) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      shift(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      shift(1);
    }
  };
  let body;
  if (period === "year")
    body = (
      <div className="td-calyear">
        {Array.from({ length: 12 }, (_, m) => (
          <CalendarMiniMonth
            key={m}
            year={Y}
            month={m}
            dates={yearDates}
            today={todayD}
            weekStartsOn={weekStartsOn}
            onOpen={() => {
              setCursor(new Date(Y, m, 1));
              setFocusIso(null);
              setPeriod("month");
            }}
          />
        ))}
      </div>
    );
  else if (period === "day")
    body = (
      <div className="td-calday">
        <CalendarDayList date={cursor} items={items.filter((it) => coversDay(it, cursor))} onOpenItem={onOpenItem} onToggleDone={onToggleDone} onToggleSubitem={onToggleSubitem} onAddItem={onAddItem} showItemIds={showItemIds} showLabels={showLabels} />
      </div>
    );
  else body = <CalendarGrid date={cursor} period={period} items={items} today={todayD} weekStartsOn={weekStartsOn} showItemIds={showItemIds} showLabels={showLabels} onOpenItem={onOpenItem} onAddItem={onAddItem} onShowMore={openDay} onReschedule={onReschedule} onNavigateDate={navigateDate} focusDate={focusIso} className="td-calview-grid" />;
  return (
    <div className={["td-calview", className ?? ""].join(" ").trim()} onKeyDown={onRootKey} style={style}>
      <CalendarHeader title={periodTitle(cursor, period, weekStartsOn)} period={period} onPeriodChange={setPeriod} onPrev={() => shift(-1)} onNext={() => shift(1)} onToday={goToday} />
      <div className="td-calview-body">{body}</div>
    </div>
  );
}

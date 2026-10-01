// Calendar model — pure helpers shared by the grid, the day list and the year view. Items land on
// their due day; an item with a start and a due at least a day apart is a span. Undated items never
// reach the calendar (the List view is where they live). Spec: DESIGN.md › Views › Calendar.
import { addDays, parseDateValue, sameDay, toISO } from "../core/dates";

export type { DateInput } from "../core/dates";
export { addDays, parseDateValue, sameDay, toISO };

export interface CalendarLabel {
  color: string;
  text?: string;
}
export interface CalendarItem {
  id: string;
  title: string;
  itemId?: string;
  labels?: CalendarLabel[];
  done?: boolean;
  due?: string | null;
  start?: string | null;
  /** The ListRow fields the day list shows */
  priority?: "Urgent" | "High" | "Medium" | "Low";
  assignees?: Array<{ name: string; src?: string; color?: string }>;
  subitems?: Array<{ id: string; title: string; itemId?: string; done: boolean }>;
  attachments?: number;
  dueState?: "default" | "overdue" | "complete";
}

export type CalendarPeriod = "day" | "week" | "month" | "year";
export const CALENDAR_PERIODS: ReadonlyArray<CalendarPeriod> = ["day", "week", "month", "year"];

const DAY = 864e5;

/** Monday-based by default (weekStartsOn 1); 0 for Sunday. */
export const startOfWeek = (d: Date, ws = 1): Date => addDays(d, -((d.getDay() - ws + 7) % 7));

export const isSpan = (it: Pick<CalendarItem, "start" | "due">): boolean => {
  const st = parseDateValue(it.start), due = parseDateValue(it.due);
  return !!(st && due && due.getTime() - st.getTime() >= DAY);
};

export const coversDay = (it: Pick<CalendarItem, "start" | "due">, d: Date): boolean => {
  const st = parseDateValue(it.start), due = parseDateValue(it.due);
  if (st && due && due.getTime() - st.getTime() >= DAY) return d >= st && d <= due;
  return sameDay(due, d);
};

/** The weeks a period shows: one for "week", every week touching the month for "month". */
export function weeksFor(date: Date, period: "week" | "month", ws = 1): Date[][] {
  if (period === "week") {
    const a = startOfWeek(date, ws);
    return [Array.from({ length: 7 }, (_, i) => addDays(a, i))];
  }
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  let cur = startOfWeek(new Date(date.getFullYear(), date.getMonth(), 1), ws);
  const out: Date[][] = [];
  do {
    out.push(Array.from({ length: 7 }, (_, i) => addDays(cur, i)));
    cur = addDays(cur, 7);
  } while (cur <= last);
  return out;
}

/** Overdue first, then open, then done — the chip order inside a day. */
export const rankChip = (it: Pick<CalendarItem, "done" | "due">, today: Date): number => {
  const due = parseDateValue(it.due);
  if (it.done) return 2;
  if (due && due < today) return 0;
  return 1;
};

export interface SpanPlacement {
  it: CalendarItem;
  st: Date;
  due: Date;
  lane: number;
  /** Column range inside the week, 0–6 */
  c1: number;
  c2: number;
  /** Continues from the previous / into the next week */
  contL: boolean;
  contR: boolean;
}

/** Lay a week's spans into lanes (first fit); longer spans first so they stay on top. */
export function placeSpans(spans: Array<{ it: CalendarItem; st: Date; due: Date }>, days: Date[]): SpanPlacement[] {
  const a = days[0]!, b = days[6]!;
  const rows: Array<Array<{ st: Date; due: Date }>> = [];
  const out: SpanPlacement[] = [];
  for (const s of spans) {
    if (s.due < a || s.st > b) continue;
    let lane = 0;
    while ((rows[lane] ?? []).some((x) => !(s.due < x.st || s.st > x.due))) lane++;
    (rows[lane] = rows[lane] ?? []).push(s);
    out.push({ ...s, lane, c1: Math.max(0, Math.round((Math.max(s.st.getTime(), a.getTime()) - a.getTime()) / DAY)), c2: Math.min(6, Math.round((Math.min(s.due.getTime(), b.getTime()) - a.getTime()) / DAY)), contL: s.st < a, contR: s.due > b });
  }
  return out;
}

/** Shift a cursor date by n periods. */
export function shiftPeriod(c: Date, period: CalendarPeriod, n: number): Date {
  const d = new Date(c);
  if (period === "month") d.setMonth(d.getMonth() + n, Math.min(c.getDate(), 28));
  else if (period === "week") d.setDate(d.getDate() + 7 * n);
  else if (period === "day") d.setDate(d.getDate() + n);
  else d.setFullYear(d.getFullYear() + n);
  return d;
}

const f = (x: Date, o: Intl.DateTimeFormatOptions) => x.toLocaleDateString("en-US", o);

/** The header title for a period: "September 2026", "Sep 7 – 13, 2026", "Monday, September 7, 2026", "2026". */
export function periodTitle(cursor: Date, period: CalendarPeriod, ws = 1): string {
  if (period === "year") return String(cursor.getFullYear());
  if (period === "day") return f(cursor, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  if (period === "week") {
    const a = startOfWeek(cursor, ws), b = addDays(a, 6);
    if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) return `${f(a, { month: "short", day: "numeric" })} – ${b.getDate()}, ${b.getFullYear()}`;
    if (a.getFullYear() === b.getFullYear()) return `${f(a, { month: "short", day: "numeric" })} – ${f(b, { month: "short", day: "numeric" })}, ${b.getFullYear()}`;
    return `${f(a, { month: "short", day: "numeric", year: "numeric" })} – ${f(b, { month: "short", day: "numeric", year: "numeric" })}`;
  }
  return f(cursor, { month: "long", year: "numeric" });
}

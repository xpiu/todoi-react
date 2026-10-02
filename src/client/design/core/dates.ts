// Date utilities — pure, shared by DatePicker, DatesPicker, quick-add and the calendar; the calendar-date
// core (src/shared/dates.ts) also runs in the API. Dates are local-midnight `Date`s in memory and ISO
// "YYYY-MM-DD" strings at the edges; times are "HH:MM".
// Spec: DESIGN.md › Content fundamentals (timestamps), Item editing › Dates, Quick-add grammar.

import { addDays, addMonths, daysBetween, daysBetweenISO, parseDateValue, pad, realDate, shiftISO, toISO, type DateInput } from "../../../shared/dates";

export { addDays, addMonths, daysBetween, daysBetweenISO, parseDateValue, realDate, shiftISO, toISO, type DateInput };

export type DateFormat = "mdy-text" | "dmy-text" | "iso" | "mdy" | "dmy";
export interface DateConventions {
  /** "Sep 12, 2026" · "12 Sep 2026" · "2026-09-12" · "09/12/2026" · "12/09/2026" */
  dateFormat: DateFormat;
  timeFormat: "24h" | "12h";
  /** 0 Sunday … 6 Saturday — the first column of every calendar */
  weekStart: 0 | 1 | 6;
}
/** How dates read everywhere — the person's Settings › General, set once by the app (`setDateConventions`). */
const conventions: DateConventions = { dateFormat: "mdy-text", timeFormat: "24h", weekStart: 1 };
export const dateConventions = (): Readonly<DateConventions> => conventions;
export function setDateConventions(next: Partial<DateConventions>) {
  Object.assign(conventions, next);
}

export const sameDay = (a: Date | null | undefined, b: Date | null | undefined): boolean =>
  !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function startOfToday(today?: DateInput): Date {
  const t = parseDateValue(today) ?? new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

export interface FormatDateOptions {
  /** "auto" drops the year inside the current one @default "always" */
  year?: "always" | "auto" | "never";
  today?: DateInput;
  /** Adds "Sat, " */
  weekday?: boolean;
}

/** "Sep 12, 2026" — the absolute-date form, in the person's date format (ISO always keeps its year). */
export function formatDate(v: DateInput, { year = "always", today, weekday }: FormatDateOptions = {}): string {
  const d = parseDateValue(v);
  if (!d) return "";
  const t = parseDateValue(today) ?? new Date();
  const withYear = year === "always" || (year === "auto" && d.getFullYear() !== t.getFullYear());
  const day = d.toLocaleDateString("en-US", { weekday: "short" });
  const [y, m, dd] = [d.getFullYear(), pad(d.getMonth() + 1), pad(d.getDate())];
  const { dateFormat } = conventions;
  let out: string;
  if (dateFormat === "iso") out = `${y}-${m}-${dd}`;
  else if (dateFormat === "mdy") out = withYear ? `${m}/${dd}/${y}` : `${m}/${dd}`;
  else if (dateFormat === "dmy") out = withYear ? `${dd}/${m}/${y}` : `${dd}/${m}`;
  else if (dateFormat === "dmy-text") out = `${d.getDate()} ${d.toLocaleDateString("en-US", { month: "short" })}${withYear ? ` ${y}` : ""}`;
  else out = d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) });
  return weekday ? `${day}, ${out}` : out;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MO = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** The next month/day on or after today; null when it does not exist (Feb 30), Feb 29 waiting for a leap year. */
function nextDayOf(m0: number, day: number, t: Date): Date | null {
  for (let y = t.getFullYear(); y <= t.getFullYear() + 4; y++) {
    const d = realDate(y, m0, day);
    if (d && d >= t) return d;
  }
  return null;
}

/** The quick-add date grammar: today, tomorrow, fri, next fri, next week, in 3 days, 12 sep, sep 12, 9/12, ISO. */
export function resolveDate(str: string, today?: DateInput): Date | null {
  const t = startOfToday(today);
  const s = str.trim().toLowerCase().replace(/\s+/g, " ");
  if (s === "today" || s === "tod") return t;
  if (s === "tomorrow" || s === "tmr" || s === "tmrw") return addDays(t, 1);
  let m: RegExpMatchArray | null;
  if ((m = /^in (\d+) ?(d|day|days|w|wk|week|weeks)$/.exec(s))) return addDays(t, +m[1]! * (m[2]![0] === "w" ? 7 : 1));
  if ((m = /^(next )?([a-z]{3,})$/.exec(s))) {
    const word = m[2]!;
    // "mon" … "monday" match by prefix of the full name, so "month" is not a Monday.
    const wi = WEEKDAYS.findIndex((w) => w.startsWith(word));
    if (wi >= 0) {
      let n = (wi - t.getDay() + 7) % 7;
      if (n === 0) n = 7;
      if (m[1] && n < 7) n += 7;
      return addDays(t, n);
    }
    if (word === "week" && m[1]) return addDays(t, 7);
    if (word === "month" && m[1]) return addMonths(t, 1);
    return null;
  }
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) return realDate(+m[1]!, +m[2]! - 1, +m[3]!);
  if ((m = /^(\d{1,2})[ /-]([a-z]{3,})$/.exec(s)) || (m = /^([a-z]{3,})[ /-](\d{1,2})$/.exec(s))) {
    const dayFirst = !isNaN(+m[1]!);
    const day = +(dayFirst ? m[1]! : m[2]!);
    const mon = dayFirst ? m[2]! : m[1]!;
    const mi = MO.findIndex((x) => mon.startsWith(x));
    return mi < 0 ? null : nextDayOf(mi, day, t);
  }
  if ((m = /^(\d{1,2})\/(\d{1,2})$/.exec(s))) return nextDayOf(+m[1]! - 1, +m[2]!, t);
  return null;
}

/** "2pm" | "14:30" | "14h30" | "2:15 pm" | "noon" | "midnight" → "HH:MM" (24h), or null. */
export function parseTime(str: string): string | null {
  const s = str.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  if (s === "noon") return "12:00";
  if (s === "midnight") return "00:00";
  const m = /^(\d{1,2})(?:[:h.](\d{2}))?(am|pm|a|p)?$/.exec(s);
  if (!m) return null;
  let h = +m[1]!;
  const min = m[2] ? +m[2] : 0;
  const ap = m[3]?.[0];
  if (min > 59) return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap === "p" && h < 12) h += 12;
    if (ap === "a" && h === 12) h = 0;
  } else if (h > 23) return null;
  return `${pad(h)}:${pad(min)}`;
}

/** "HH:MM" → "14:30", or "2:30 pm" in the 12-hour format; empty for null. */
export function formatTime(t: string | null | undefined): string {
  if (!t) return "";
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return t;
  const h = +m[1]!;
  return conventions.timeFormat === "12h" ? `${h % 12 || 12}:${m[2]} ${h < 12 ? "am" : "pm"}` : `${pad(h)}:${m[2]}`;
}

/** "Sep 10 – Sep 12, 2026 · 14:00" / "Sep 12, 2026" / "From Sep 10, 2026" / "". */
export function formatDateRange(start: DateInput, due: DateInput, time?: string | null, opts: Pick<FormatDateOptions, "today" | "year"> = {}): string {
  const s = parseDateValue(start);
  const d = parseDateValue(due);
  let out = "";
  if (s && d) {
    if (sameDay(s, d)) out = formatDate(d, opts);
    else if (s.getFullYear() === d.getFullYear()) out = `${formatDate(s, { year: "never" })} – ${formatDate(d, opts)}`;
    else out = `${formatDate(s)} – ${formatDate(d)}`;
  } else if (d) out = formatDate(d, opts);
  else if (s) out = `From ${formatDate(s, opts)}`;
  if (out && d && time) out += ` · ${formatTime(time)}`;
  return out;
}

/** "just now", "5 min ago", "3 hours ago", "yesterday", else the absolute date — for comment and activity rows. */
export function formatRelative(v: DateInput, now: Date = new Date()): string {
  const d = v instanceof Date ? v : v ? new Date(v) : null;
  if (!d || isNaN(d.getTime())) return "";
  const s = Math.round((now.getTime() - d.getTime()) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) {
    const h = Math.round(s / 3600);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  if (s < 172800) return "yesterday";
  return formatDate(d, { year: "auto", today: now });
}

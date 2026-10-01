// Date utilities — pure, shared by DatePicker, DatesPicker, quick-add, the calendar and the API later.
// Dates are local-midnight `Date`s in memory and ISO "YYYY-MM-DD" strings at the edges; times are "HH:MM".
// Spec: DESIGN.md › Content fundamentals (timestamps), Item editing › Dates, Quick-add grammar.

export type DateInput = string | Date | null | undefined;

const pad = (n: number) => String(n).padStart(2, "0");

export function toISO(d: Date | null | undefined): string | null {
  return d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : null;
}

/** ISO "2026-09-12" or anything Date parses ("Sep 12, 2026") → local-midnight Date; null for empty / invalid. */
export function parseDateValue(v: DateInput): Date | null {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : new Date(v.getFullYear(), v.getMonth(), v.getDate());
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(v));
  if (m) return new Date(+m[1]!, +m[2]! - 1, +m[3]!);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export const addDays = (d: Date, n: number): Date => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

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

/** "Sep 12, 2026" — the system's absolute-date form. */
export function formatDate(v: DateInput, { year = "always", today, weekday }: FormatDateOptions = {}): string {
  const d = parseDateValue(v);
  if (!d) return "";
  const t = parseDateValue(today) ?? new Date();
  const o: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (weekday) o.weekday = "short";
  if (year === "always" || (year === "auto" && d.getFullYear() !== t.getFullYear())) o.year = "numeric";
  return d.toLocaleDateString("en-US", o);
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MO = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

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
    if (word === "month" && m[1]) {
      const x = new Date(t);
      x.setMonth(x.getMonth() + 1);
      return x;
    }
    return null;
  }
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) return new Date(+m[1]!, +m[2]! - 1, +m[3]!);
  if ((m = /^(\d{1,2})[ /-]([a-z]{3,})$/.exec(s)) || (m = /^([a-z]{3,})[ /-](\d{1,2})$/.exec(s))) {
    const dayFirst = !isNaN(+m[1]!);
    const day = +(dayFirst ? m[1]! : m[2]!);
    const mon = dayFirst ? m[2]! : m[1]!;
    const mi = MO.findIndex((x) => mon.startsWith(x));
    if (mi < 0 || day < 1 || day > 31) return null;
    let d = new Date(t.getFullYear(), mi, day);
    if (d < t) d = new Date(t.getFullYear() + 1, mi, day);
    return d;
  }
  if ((m = /^(\d{1,2})\/(\d{1,2})$/.exec(s))) {
    const d = new Date(t.getFullYear(), +m[1]! - 1, +m[2]!);
    if (d < t) d.setFullYear(d.getFullYear() + 1);
    return d;
  }
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

/** "HH:MM" → "14:30" (24h); empty for null. */
export function formatTime(t: string | null | undefined): string {
  if (!t) return "";
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  return m ? `${pad(+m[1]!)}:${m[2]}` : t;
}

/** "Sep 10 – Sep 12, 2026 · 14:00" / "Sep 12, 2026" / "From Sep 10, 2026" / "". */
export function formatDateRange(start: DateInput, due: DateInput, time?: string | null, opts: { today?: DateInput } = {}): string {
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

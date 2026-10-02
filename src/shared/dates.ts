// Calendar-date helpers shared by the client and the API (recurrence runs on both). Dates are
// local-midnight `Date`s in memory and ISO "YYYY-MM-DD" strings at the edges. They are calendar days,
// not instants: no timezone is stored, and "today" is the device's day (DESIGN.md › Dates).

export type DateInput = string | Date | null | undefined;

export const pad = (n: number) => String(n).padStart(2, "0");

const DAY_MS = 864e5;

export function toISO(d: Date | null | undefined): string | null {
  return d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : null;
}

/** The local-midnight date for year / month (0-based) / day, or null when that day does not exist (Feb 31). */
export function realDate(y: number, m0: number, d: number): Date | null {
  const x = new Date(y, m0, d);
  return x.getFullYear() === y && x.getMonth() === m0 && x.getDate() === d ? x : null;
}

/** ISO "2026-09-12" or anything Date parses ("Sep 12, 2026") → local-midnight Date; null for empty / invalid (Feb 31 too). */
export function parseDateValue(v: DateInput): Date | null {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : new Date(v.getFullYear(), v.getMonth(), v.getDate());
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(v));
  if (m) return realDate(+m[1]!, +m[2]! - 1, +m[3]!);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export const addDays = (d: Date, n: number): Date => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

/** `n` months on, kept inside the month: Jan 31 + 1 → Feb 28 (29 in a leap year). */
export function addMonths(d: Date, n: number): Date {
  const first = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(d.getDate(), last));
}

/** "2026-02-28" yes, "2026-02-31" no (and not "2026-9-1"). */
export const isRealISODate = (v: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(v) && !!parseDateValue(v);

/** Whole calendar days from `a` to `b` (negative when `b` is earlier); exact across DST changes. */
export const daysBetween = (a: Date, b: Date): number =>
  Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / DAY_MS);

/** `daysBetween` for two ISO dates (0 when either is missing or not a real date). */
export function daysBetweenISO(a: string | null, b: string | null): number {
  const x = parseDateValue(a), y = parseDateValue(b);
  return x && y ? daysBetween(x, y) : 0;
}

/** An ISO date `n` days on; null stays null. */
export function shiftISO(iso: string | null, n: number): string | null {
  const d = parseDateValue(iso);
  return d ? toISO(addDays(d, n)) : null;
}

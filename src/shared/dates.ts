// Calendar-date helpers shared by the client and the API (recurrence runs on both). Dates are
// local-midnight `Date`s in memory and ISO "YYYY-MM-DD" strings at the edges.

export type DateInput = string | Date | null | undefined;

export const pad = (n: number) => String(n).padStart(2, "0");

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

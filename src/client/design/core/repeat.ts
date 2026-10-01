// Repeat rules — pure functions behind RepeatPicker and recurring completion (DESIGN.md › Repeat,
// Recurring item completion). A rule is a plain object the item stores; dates are ISO strings.
import { addDays, formatDate, parseDateValue, toISO, type DateInput } from "./dates";

export type RepeatFreq = "daily" | "weekly" | "monthly" | "yearly";
export type RepeatEnds = { type: "never" } | { type: "on"; date: string | null } | { type: "after"; count: number };

export interface RepeatRule {
  freq: RepeatFreq;
  /** @default 1 */
  interval?: number;
  /** Weekly rules only: 0 = Sunday … 6 = Saturday */
  byWeekday?: number[];
  ends?: RepeatEnds;
}

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const UNITS: Record<RepeatFreq, [singular: string, plural: string]> = {
  daily: ["day", "days"],
  weekly: ["week", "weeks"],
  monthly: ["month", "months"],
  yearly: ["year", "years"],
};
const ordinal = (n: number) => n + (n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th");
const WEEKDAYS = [1, 2, 3, 4, 5];
const isWeekdays = (days: number[] | undefined) => !!days && days.length === 5 && WEEKDAYS.every((d) => days.includes(d));

/** Rule → sentence: "Weekly on Fri", "Every 2 weeks on Mon, Wed until Dec 31", "Daily · 5 times". `anchor` = the item's due (ISO). */
export function describeRepeat(rule: RepeatRule | null | undefined, anchor?: DateInput): string {
  if (!rule?.freq) return "";
  const n = rule.interval ?? 1;
  const a = parseDateValue(anchor);
  let s: string;
  if (rule.freq === "weekly" && isWeekdays(rule.byWeekday) && n === 1) s = "Every weekday";
  else {
    s = n === 1 ? { daily: "Daily", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" }[rule.freq] : `Every ${n} ${UNITS[rule.freq][1]}`;
    if (rule.freq === "weekly") {
      const days = (rule.byWeekday?.length ? rule.byWeekday : a ? [a.getDay()] : []).slice().sort((x, y) => x - y);
      if (days.length) s += " on " + days.map((d) => WD[d]).join(", ");
    } else if (rule.freq === "monthly" && a) s += ` on the ${ordinal(a.getDate())}`;
    else if (rule.freq === "yearly" && a) s += ` on ${formatDate(a, { year: "never" })}`;
  }
  const e = rule.ends;
  if (e?.type === "on" && e.date) s += " until " + formatDate(e.date, { year: "auto" });
  else if (e?.type === "after" && e.count) s += ` · ${e.count} ${e.count === 1 ? "time" : "times"}`;
  return s;
}

/** Monday-based week index of a date (days since epoch Monday, divided by 7). */
const weekIndex = (d: Date) => Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000 + 3) / 7);

/** Next occurrence (ISO) after `from`, honouring interval and weekdays; null once the rule has ended. `count` = occurrences already completed. */
export function nextOccurrence(rule: RepeatRule | null | undefined, from: DateInput, count = 0): string | null {
  const d = parseDateValue(from);
  if (!rule || !d) return null;
  const n = Math.max(1, rule.interval ?? 1);
  let x = new Date(d);
  if (rule.freq === "daily") x = addDays(d, n);
  else if (rule.freq === "weekly") {
    const days = (rule.byWeekday?.length ? rule.byWeekday : [d.getDay()]).slice().sort((a, b) => a - b);
    const w0 = weekIndex(d);
    let found: Date | null = null;
    for (let i = 1; i <= 7 * n + 7 && !found; i++) {
      const c = addDays(d, i);
      if (days.includes(c.getDay()) && (weekIndex(c) - w0) % n === 0) found = c;
    }
    x = found ?? addDays(d, 7 * n);
  } else if (rule.freq === "monthly") x.setMonth(x.getMonth() + n);
  else if (rule.freq === "yearly") x.setFullYear(x.getFullYear() + n);
  const e = rule.ends;
  const iso = toISO(x)!;
  if (e?.type === "on" && e.date && iso > e.date) return null;
  if (e?.type === "after" && e.count && count + 1 >= e.count) return null;
  return iso;
}

export interface CompleteRecurringResult {
  /** The due to reopen the item with, or null when the rule has ended */
  next: string | null;
  count: number;
  ended: boolean;
  icon: "repeat";
  /** Toast copy: 'Completed “…” — next due Sep 3' */
  message: string;
  /** "3 of 10" for ends-after rules */
  meta?: string;
}

/** Checking a recurring item done. Pure: the consumer applies `next` (reopen with it, store `count`) or leaves it done. */
export function completeRecurring(rule: RepeatRule, due: DateInput, { title, count = 0, today }: { title?: string; count?: number; today?: DateInput } = {}): CompleteRecurringResult {
  const next = nextOccurrence(rule, due, count);
  const t = title ? "“" + (title.length > 40 ? title.slice(0, 39).trimEnd() + "…" : title) + "”" : "the item";
  const e = rule.ends;
  const meta = e?.type === "after" && e.count ? `${Math.min(count + 1, e.count)} of ${e.count}` : undefined;
  if (!next) return { next: null, count: count + 1, ended: true, icon: "repeat", message: `Completed ${t} — that was the last repeat`, meta };
  return { next, count: count + 1, ended: false, icon: "repeat", message: `Completed ${t} — next due ${formatDate(next, { year: "auto", today })}`, meta };
}

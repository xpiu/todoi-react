// Repeat rules — pure functions behind RepeatPicker and recurring completion (DESIGN.md › Repeat,
// Recurring item completion). A rule is a plain object the item stores; dates are ISO strings.
import { nextOccurrence, type Occurrence } from "../../../shared/completion";
import { formatDate, parseDateValue, type DateInput } from "./dates";

export { nextOccurrence };

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

/** Toast copy for one completed occurrence (the API decides it): 'Completed “…” — next due Sep 3', "3 of 10". */
export function describeCompletion(o: Occurrence, rule: RepeatRule | null | undefined, { title, today }: { title?: string; today?: DateInput } = {}): { icon: "repeat"; message: string; meta?: string } {
  const t = title ? "“" + (title.length > 40 ? title.slice(0, 39).trimEnd() + "…" : title) + "”" : "the item";
  const e = rule?.ends;
  const meta = e?.type === "after" && e.count ? `${Math.min(o.count, e.count)} of ${e.count}` : undefined;
  return { icon: "repeat", message: o.next ? `Completed ${t} — next due ${formatDate(o.next, { year: "auto", today })}` : `Completed ${t} — that was the last repeat`, meta };
}

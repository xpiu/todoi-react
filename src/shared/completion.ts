// Completion rules, shared so the API applies them and the client predicts them identically
// (DESIGN.md › Recurring item completion, Lists & Status linking). Pure: no I/O, no zod.
import { addDays, addMonths, daysBetween, parseDateValue, shiftISO, toISO, type DateInput } from "./dates";
import type { ItemStatus } from "./item-status";
import type { RepeatRule } from "./items";

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
  } else if (rule.freq === "monthly") x = addMonths(d, n);
  // Kept inside the month, so a Jan 31 or Feb 29 item does not spill into the next month.
  else if (rule.freq === "yearly") x = addMonths(d, 12 * n);
  const e = rule.ends;
  const iso = toISO(x)!;
  if (e?.type === "on" && e.date && iso > e.date) return null;
  if (e?.type === "after" && e.count && count + 1 >= e.count) return null;
  return iso;
}

/** The fields completion reads and writes. */
export interface CompletionFields {
  status: ItemStatus | null;
  priorStatus: ItemStatus | null;
  done: boolean;
  dueDate: string | null;
  /** Moves with the due, so an occurrence keeps its length */
  startDate?: string | null;
  repeatRule: RepeatRule | null;
  repeatCount: number;
}
type StatusFields = Pick<CompletionFields, "status" | "done" | "priorStatus">;

/**
 * The one status invariant: done ⇔ Status Done. Becoming Done (checkbox, Status, a Done list, import)
 * remembers the Status to reopen with; any other Status clears that memory.
 */
export function statusChange(cur: StatusFields, status: ItemStatus | null): StatusFields {
  if (status === "DONE") return { status, done: true, priorStatus: cur.done || cur.status === "DONE" ? cur.priorStatus : cur.status };
  return { status, done: false, priorStatus: null };
}

/** Unchecking: back to the remembered Status. */
export const reopen = (cur: StatusFields): StatusFields => ({ status: cur.priorStatus === "DONE" ? null : cur.priorStatus, done: false, priorStatus: null });

/** One completed occurrence of a recurring item: from which due, to which (null once the rule has ended). */
export interface Occurrence {
  from: string;
  next: string | null;
  count: number;
  ended: boolean;
}

/**
 * Checking an item done. A recurring item with a due moves to its next occurrence and stays open; on its
 * last occurrence it is done like any other item.
 */
export function complete(cur: CompletionFields): { patch: Partial<CompletionFields>; occurrence: Occurrence | null } {
  if (!cur.done && cur.repeatRule && cur.dueDate) {
    const next = nextOccurrence(cur.repeatRule, cur.dueDate, cur.repeatCount);
    const count = cur.repeatCount + 1;
    const occurrence = { from: cur.dueDate, next, count, ended: !next };
    const startDate = next && cur.startDate ? { startDate: shiftISO(cur.startDate, daysBetween(parseDateValue(cur.dueDate)!, parseDateValue(next)!)) } : {};
    return { patch: next ? { dueDate: next, ...startDate, repeatCount: count } : { ...statusChange(cur, "DONE"), repeatCount: count }, occurrence };
  }
  return { patch: statusChange(cur, "DONE"), occurrence: null };
}

/**
 * A done / Status request applied to an item — the same function behind the API and the optimistic patch.
 * `done: true` completes (a recurring item moves on); a Status, Done included, is set as given.
 */
export function applyCompletion(cur: CompletionFields, { done, status }: { done?: boolean; status?: ItemStatus | null }): { patch: Partial<CompletionFields>; occurrence: Occurrence | null } {
  if (done === true) return complete(cur);
  if (done === false) return { patch: status === undefined ? reopen(cur) : statusChange(cur, status), occurrence: null };
  return { patch: status === undefined ? {} : statusChange(cur, status), occurrence: null };
}

// A zone with daylight saving, so the spring-forward night (23 hours) is exercised; Vitest runs each
// file in its own process, so this does not leak into other tests.
process.env.TZ = "Europe/Brussels";

import { describe, expect, it } from "vitest";

import { addMonths, daysBetween, isRealISODate, parseDateValue, shiftISO, toISO } from "./dates";
import { nextOccurrence } from "./completion";
import { createItemSchema, dateRangeIssue, updateItemSchema } from "./items";

const d = (iso: string) => parseDateValue(iso)!;

describe("real calendar dates", () => {
  it("accepts leap days only in leap years and never rolls an impossible day over", () => {
    expect(isRealISODate("2028-02-29")).toBe(true);
    expect(isRealISODate("2026-02-29")).toBe(false);
    expect(isRealISODate("2026-02-31")).toBe(false);
    expect(isRealISODate("2026-13-01")).toBe(false);
    expect(isRealISODate("2026-9-1")).toBe(false);
    expect(parseDateValue("2026-02-31")).toBeNull();
  });
  it("keeps a month step inside the month", () => {
    expect(toISO(addMonths(d("2026-01-31"), 1))).toBe("2026-02-28");
    expect(toISO(addMonths(d("2028-01-31"), 1))).toBe("2028-02-29");
    expect(toISO(addMonths(d("2028-02-29"), 12))).toBe("2029-02-28");
    expect(toISO(addMonths(d("2026-12-15"), 1))).toBe("2027-01-15");
  });
  it("counts calendar days across daylight-saving changes", () => {
    expect(d("2026-03-30").getTime() - d("2026-03-29").getTime()).toBe(23 * 3600e3);
    expect(daysBetween(d("2026-03-29"), d("2026-03-30"))).toBe(1);
    expect(daysBetween(d("2026-10-24"), d("2026-10-26"))).toBe(2);
    expect(daysBetween(d("2026-03-30"), d("2026-03-27"))).toBe(-3);
    expect(shiftISO("2026-03-28", 2)).toBe("2026-03-30");
    expect(shiftISO(null, 2)).toBeNull();
  });
});

describe("monthly and yearly repeats", () => {
  it("stay inside short months and leap years", () => {
    expect(nextOccurrence({ freq: "monthly" }, "2026-01-31")).toBe("2026-02-28");
    expect(nextOccurrence({ freq: "yearly" }, "2028-02-29")).toBe("2029-02-28");
    expect(nextOccurrence({ freq: "monthly", interval: 2 }, "2026-08-31")).toBe("2026-10-31");
  });
});

describe("item date rules", () => {
  const base = { id: "a".repeat(21), title: "T" };
  const issue = (r: { success: boolean; error?: { issues: Array<{ path: PropertyKey[]; message: string }> } }) => (r.success ? null : r.error!.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  it("rejects impossible dates and times with the field named", () => {
    expect(issue(createItemSchema.safeParse({ ...base, dueDate: "2026-02-31" }))).toEqual(["dueDate: Use a real date written as YYYY-MM-DD"]);
    expect(issue(updateItemSchema.safeParse({ dueTime: "29:99" }))).toEqual(["dueTime: Use a time from 00:00 to 23:59"]);
    expect(issue(updateItemSchema.safeParse({ dueTime: "24:00" }))).not.toBeNull();
    expect(issue(updateItemSchema.safeParse({ dueDate: "2028-02-29", dueTime: "23:59" }))).toBeNull();
  });
  it("keeps the start on or before the due, and a time with a due", () => {
    expect(issue(createItemSchema.safeParse({ ...base, startDate: "2026-09-12", dueDate: "2026-09-10" }))).toEqual(["startDate: The start date must be on or before the due date"]);
    expect(issue(createItemSchema.safeParse({ ...base, startDate: "2026-09-10", dueDate: "2026-09-10" }))).toBeNull();
    expect(issue(createItemSchema.safeParse({ ...base, dueTime: "09:00" }))).toEqual(["dueTime: A time needs a due date"]);
    expect(issue(updateItemSchema.safeParse({ dueDate: null, dueTime: "09:00" }))).toEqual(["dueTime: A time needs a due date"]);
    // One field alone is checked against the stored item by the API.
    expect(issue(updateItemSchema.safeParse({ startDate: "2026-09-12" }))).toBeNull();
    expect(dateRangeIssue({ startDate: "2026-09-12", dueDate: "2026-09-10", dueTime: null })?.path).toBe("startDate");
  });
});

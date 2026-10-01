import { describe, expect, it } from "vitest";

import { addDays, formatDate, formatDateRange, formatTime, parseDateValue, parseTime, resolveDate, toISO } from "./dates";

// Fixed anchor: Tuesday 2026-08-25.
const TODAY = "2026-08-25";
const iso = (s: string, t = TODAY) => toISO(resolveDate(s, t));

describe("parseDateValue / toISO", () => {
  it("round-trips ISO and accepts display strings", () => {
    expect(toISO(parseDateValue("2026-09-12"))).toBe("2026-09-12");
    expect(toISO(parseDateValue("Sep 12, 2026"))).toBe("2026-09-12");
    expect(parseDateValue("")).toBeNull();
    expect(parseDateValue("nope")).toBeNull();
    expect(toISO(null)).toBeNull();
  });
  it("strips the time from Date inputs", () => {
    const d = parseDateValue(new Date(2026, 8, 12, 15, 30))!;
    expect(d.getHours()).toBe(0);
    expect(toISO(d)).toBe("2026-09-12");
  });
});

describe("resolveDate (quick-add grammar)", () => {
  it("relative words", () => {
    expect(iso("today")).toBe("2026-08-25");
    expect(iso("tomorrow")).toBe("2026-08-26");
    expect(iso("in 3 days")).toBe("2026-08-28");
    expect(iso("in 2 weeks")).toBe("2026-09-08");
    expect(iso("next week")).toBe("2026-09-01");
    expect(iso("next month")).toBe("2026-09-25");
  });
  it("weekdays go forward, never today; 'next' skips a week", () => {
    expect(iso("fri")).toBe("2026-08-28");
    expect(iso("tue")).toBe("2026-09-01"); // today is Tuesday → next Tuesday
    expect(iso("next fri")).toBe("2026-09-04");
    expect(iso("monday")).toBe("2026-08-31");
  });
  it("day + month in either order, rolling into next year when past", () => {
    expect(iso("12 sep")).toBe("2026-09-12");
    expect(iso("sep 12")).toBe("2026-09-12");
    expect(iso("sep-12")).toBe("2026-09-12");
    expect(iso("3 jan")).toBe("2027-01-03");
    expect(iso("9/12")).toBe("2026-09-12");
    expect(iso("2026-12-31")).toBe("2026-12-31");
  });
  it("rejects nonsense", () => {
    expect(resolveDate("whenever", TODAY)).toBeNull();
    expect(resolveDate("32 sep", TODAY)).toBeNull();
    expect(resolveDate("", TODAY)).toBeNull();
  });
});

describe("formatDate", () => {
  it("absolute form with optional year and weekday", () => {
    expect(formatDate("2026-09-12")).toBe("Sep 12, 2026");
    expect(formatDate("2026-09-12", { year: "auto", today: TODAY })).toBe("Sep 12");
    expect(formatDate("2027-01-03", { year: "auto", today: TODAY })).toBe("Jan 3, 2027");
    expect(formatDate("2026-09-12", { weekday: true })).toBe("Sat, Sep 12, 2026");
    expect(formatDate(null)).toBe("");
  });
});

describe("parseTime / formatTime", () => {
  it("accepts 12h and 24h forms", () => {
    expect(parseTime("2pm")).toBe("14:00");
    expect(parseTime("2:15 pm")).toBe("14:15");
    expect(parseTime("14:30")).toBe("14:30");
    expect(parseTime("12am")).toBe("00:00");
    expect(parseTime("12pm")).toBe("12:00");
    expect(parseTime("noon")).toBe("12:00");
    expect(parseTime("9")).toBe("09:00");
  });
  it("rejects out-of-range values", () => {
    expect(parseTime("25:00")).toBeNull();
    expect(parseTime("13pm")).toBeNull();
    expect(parseTime("10:75")).toBeNull();
    expect(parseTime("")).toBeNull();
  });
  it("formats", () => {
    expect(formatTime("9:05")).toBe("09:05");
    expect(formatTime(null)).toBe("");
  });
});

describe("formatDateRange", () => {
  it("covers every shape the Dates trigger shows", () => {
    expect(formatDateRange("2026-09-10", "2026-09-12", "14:00")).toBe("Sep 10 – Sep 12, 2026 · 14:00");
    expect(formatDateRange(null, "2026-09-12")).toBe("Sep 12, 2026");
    expect(formatDateRange("2026-09-10", null)).toBe("From Sep 10, 2026");
    expect(formatDateRange("2026-09-12", "2026-09-12")).toBe("Sep 12, 2026");
    expect(formatDateRange("2026-12-30", "2027-01-02")).toBe("Dec 30, 2026 – Jan 2, 2027");
    expect(formatDateRange(null, null, "14:00")).toBe("");
  });
});

describe("addDays", () => {
  it("crosses month ends", () => {
    expect(toISO(addDays(parseDateValue("2026-08-31")!, 1))).toBe("2026-09-01");
  });
});

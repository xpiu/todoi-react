import { describe, expect, it } from "vitest";

import { completeRecurring, describeRepeat, nextOccurrence, type RepeatRule } from "./repeat";

const DUE = "2026-09-12"; // Saturday

describe("describeRepeat", () => {
  it("words presets from the anchor", () => {
    expect(describeRepeat({ freq: "daily" }, DUE)).toBe("Daily");
    expect(describeRepeat({ freq: "weekly", byWeekday: [5] }, DUE)).toBe("Weekly on Fri");
    expect(describeRepeat({ freq: "weekly" }, DUE)).toBe("Weekly on Sat");
    expect(describeRepeat({ freq: "weekly", byWeekday: [1, 2, 3, 4, 5] }, DUE)).toBe("Every weekday");
    expect(describeRepeat({ freq: "monthly" }, DUE)).toBe("Monthly on the 12th");
    expect(describeRepeat({ freq: "yearly" }, DUE)).toBe("Yearly on Sep 12");
  });
  it("words custom rules and endings", () => {
    expect(describeRepeat({ freq: "weekly", interval: 2, byWeekday: [3, 1], ends: { type: "on", date: "2026-12-31" } }, DUE)).toBe("Every 2 weeks on Mon, Wed until Dec 31");
    expect(describeRepeat({ freq: "daily", ends: { type: "after", count: 5 } }, DUE)).toBe("Daily · 5 times");
    expect(describeRepeat({ freq: "monthly", interval: 3 }, DUE)).toBe("Every 3 months on the 12th");
    expect(describeRepeat(null, DUE)).toBe("");
  });
});

describe("nextOccurrence", () => {
  it("daily, monthly and yearly intervals", () => {
    expect(nextOccurrence({ freq: "daily" }, DUE)).toBe("2026-09-13");
    expect(nextOccurrence({ freq: "daily", interval: 3 }, DUE)).toBe("2026-09-15");
    expect(nextOccurrence({ freq: "monthly" }, DUE)).toBe("2026-10-12");
    expect(nextOccurrence({ freq: "yearly" }, DUE)).toBe("2027-09-12");
  });
  it("weekly rules honour weekdays and the interval", () => {
    expect(nextOccurrence({ freq: "weekly" }, DUE)).toBe("2026-09-19");
    expect(nextOccurrence({ freq: "weekly", byWeekday: [1, 3] }, DUE)).toBe("2026-09-14");
    expect(nextOccurrence({ freq: "weekly", byWeekday: [1, 3] }, "2026-09-14")).toBe("2026-09-16");
    // every 2 weeks on Monday from Sat Sep 12 (week of Sep 7): the next Monday in a week 2n ahead is Sep 21
    expect(nextOccurrence({ freq: "weekly", interval: 2, byWeekday: [1] }, DUE)).toBe("2026-09-21");
    expect(nextOccurrence({ freq: "weekly", interval: 2, byWeekday: [1] }, "2026-09-21")).toBe("2026-10-05");
  });
  it("stops at the end rule", () => {
    expect(nextOccurrence({ freq: "daily", ends: { type: "on", date: "2026-09-12" } }, DUE)).toBeNull();
    expect(nextOccurrence({ freq: "daily", ends: { type: "on", date: "2026-09-13" } }, DUE)).toBe("2026-09-13");
    expect(nextOccurrence({ freq: "daily", ends: { type: "after", count: 3 } }, DUE, 1)).toBe("2026-09-13");
    expect(nextOccurrence({ freq: "daily", ends: { type: "after", count: 3 } }, DUE, 2)).toBeNull();
    expect(nextOccurrence(null, DUE)).toBeNull();
  });
});

describe("completeRecurring", () => {
  const rule: RepeatRule = { freq: "weekly", byWeekday: [4], ends: { type: "after", count: 10 } };
  it("returns the next due plus the toast copy", () => {
    const r = completeRecurring(rule, "2026-08-27", { title: "Check both dealers' stock lists", count: 2, today: "2026-08-25" });
    expect(r).toEqual({ next: "2026-09-03", count: 3, ended: false, icon: "repeat", message: "Completed “Check both dealers' stock lists” — next due Sep 3", meta: "3 of 10" });
  });
  it("says when it was the last repeat and truncates long titles", () => {
    const r = completeRecurring({ freq: "daily", ends: { type: "after", count: 1 } }, DUE, { title: "A".repeat(50) });
    expect(r.ended).toBe(true);
    expect(r.next).toBeNull();
    expect(r.message).toBe("Completed “" + "A".repeat(39) + "…” — that was the last repeat");
    expect(r.meta).toBe("1 of 1");
  });
});

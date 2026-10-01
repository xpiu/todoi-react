import { describe, expect, it } from "vitest";

import { coversDay, isSpan, periodTitle, placeSpans, rankChip, shiftPeriod, weeksFor } from "./calendar";

const d = (s: string) => new Date(s + "T00:00:00");

describe("calendar model", () => {
  it("builds Monday-based weeks covering the month", () => {
    const weeks = weeksFor(d("2026-09-15"), "month");
    expect(weeks[0]![0]!.getDay()).toBe(1);
    expect(weeks[0]![0]).toEqual(d("2026-08-31"));
    expect(weeks.at(-1)![6]).toEqual(d("2026-10-04"));
    expect(weeksFor(d("2026-09-15"), "week")).toHaveLength(1);
  });
  it("spans need a start and a due at least a day apart", () => {
    expect(isSpan({ start: "2026-09-01", due: "2026-09-03" })).toBe(true);
    expect(isSpan({ start: "2026-09-01", due: "2026-09-01" })).toBe(false);
    expect(coversDay({ start: "2026-09-01", due: "2026-09-03" }, d("2026-09-02"))).toBe(true);
    expect(coversDay({ due: "2026-09-03" }, d("2026-09-02"))).toBe(false);
  });
  it("lays overlapping spans into lanes and clips them to the week", () => {
    const days = weeksFor(d("2026-09-07"), "week")[0]!;
    const mk = (id: string, s: string, e: string) => ({ it: { id, title: id }, st: d(s), due: d(e) });
    const placed = placeSpans([mk("a", "2026-09-05", "2026-09-09"), mk("b", "2026-09-08", "2026-09-10"), mk("c", "2026-09-11", "2026-09-20")], days);
    expect(placed.map((p) => [p.it.id, p.lane, p.c1, p.c2, p.contL, p.contR])).toEqual([
      ["a", 0, 0, 2, true, false],
      ["b", 1, 1, 3, false, false],
      ["c", 0, 4, 6, false, true],
    ]);
  });
  it("ranks overdue before open before done, shifts periods and titles them", () => {
    const today = d("2026-09-10");
    expect(rankChip({ due: "2026-09-01" }, today)).toBe(0);
    expect(rankChip({ due: "2026-09-20" }, today)).toBe(1);
    expect(rankChip({ due: "2026-09-01", done: true }, today)).toBe(2);
    expect(shiftPeriod(d("2026-01-31"), "month", 1).getMonth()).toBe(1);
    expect(periodTitle(d("2026-09-10"), "month")).toBe("September 2026");
    expect(periodTitle(d("2026-09-10"), "week")).toBe("Sep 7 – 13, 2026");
    expect(periodTitle(d("2026-12-30"), "week")).toBe("Dec 28, 2026 – Jan 3, 2027");
  });
});

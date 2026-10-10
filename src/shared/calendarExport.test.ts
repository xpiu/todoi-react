import { expect, it } from "vitest";

import { itemsToCalendar } from "./calendarExport";

const item = { id: "calendar-item", title: "Plan", description: null, projectId: "project", dueDate: "2028-02-29", startDate: null, dueTime: null, done: false };
const now = new Date("2026-10-10T12:34:56Z");
const exportItems = (items: Parameters<typeof itemsToCalendar>[0]) => itemsToCalendar(items, "https://todoi.example/", now);

it("exports all-day ranges with an exclusive end and skips undated items", () => {
  const data = exportItems([{ ...item, startDate: "2028-02-27" }, { ...item, id: "undated", dueDate: null }]);
  expect(data).toContain("DTSTART;VALUE=DATE:20280227\r\nDTEND;VALUE=DATE:20280301");
  expect(data).toContain("UID:calendar-item@todoi.app\r\nDTSTAMP:20261010T123456Z");
  expect(data.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  expect(data).toContain("URL:https://todoi.example/p/project?item=calendar-item");
  expect(data).toMatch(/END:VCALENDAR\r\n$/);
});

it("exports local due times without inventing a duration, and preserves timed ranges", () => {
  const data = exportItems([{ ...item, dueTime: "09:30" }, { ...item, id: "range", dueTime: "17:00", startDate: "2028-02-28" }]);
  expect(data).toContain("DTSTART:20280229T093000\r\nURL:");
  expect(data).toContain("DTSTART:20280228T000000\r\nDTEND:20280229T170000");
});

it("escapes user text and folds Unicode without breaking code points or injecting content lines", () => {
  const title = "計画😀".repeat(30) + ", team; notes\\next\r\nEND:VEVENT";
  const data = exportItems([{ ...item, title, description: "Line one\nLine two", done: true }]);
  const unfolded = data.replace(/\r\n /g, "");
  expect(unfolded).toContain(`SUMMARY:${"計画😀".repeat(30)}\\, team\\; notes\\\\next\\nEND:VEVENT`);
  expect(unfolded).toContain("DESCRIPTION:Line one\\nLine two\\n\\nCompleted in Todoi.");
  expect(data.split("\r\n").every((line) => new TextEncoder().encode(line).length <= 75)).toBe(true);
  expect(data.match(/\r\nEND:VEVENT\r\n/g)).toHaveLength(1);
});

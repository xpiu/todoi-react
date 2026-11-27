import { describe, expect, it } from "vitest";

import { isStaffEmail, qaContextSchema, qaEnvironment } from "./qa";

describe("QA notes: who and where", () => {
  it("counts only addresses at todoi.com as todoi's own people", () => {
    expect(isStaffEmail("flo@todoi.com")).toBe(true);
    expect(isStaffEmail(" Info@Todoi.COM ")).toBe(true);
    expect(isStaffEmail("flo@todoi.org")).toBe(false);
    expect(isStaffEmail("flo@nottodoi.com")).toBe(false);
    expect(isStaffEmail("flo@todoi.com.example.test")).toBe(false);
    expect(isStaffEmail("todoi.com")).toBe(false);
    expect(isStaffEmail(null)).toBe(false);
  });

  it("names the deployment by the app's address", () => {
    expect(qaEnvironment("http://localhost:5173")).toBe("local");
    expect(qaEnvironment("http://127.0.0.1:3000")).toBe("local");
    expect(qaEnvironment("https://staging.todoi.com")).toBe("staging");
    expect(qaEnvironment("https://todoi.com")).toBe("live");
    expect(qaEnvironment("not a url")).toBe("live");
  });

  it("refuses a context with oversized or missing fields", () => {
    const ok = { url: "https://todoi.com/inbox", title: "Inbox", userAgent: "UA", language: "en-US", timeZone: "Europe/Brussels", sentAt: "2026-11-27T15:04:05.000Z", viewport: { width: 1280, height: 800, dpr: 2 }, screen: { width: 1512, height: 982 }, appearance: { theme: "minimal" }, build: { sha: "dev", builtAt: null }, online: true, strokes: 1, marked: [], errors: [], capture: { ok: true, ms: 300 } };
    expect(qaContextSchema.safeParse(ok).success).toBe(true);
    expect(qaContextSchema.safeParse({ ...ok, url: "x".repeat(2001) }).success).toBe(false);
    expect(qaContextSchema.safeParse({ ...ok, marked: Array.from({ length: 13 }, () => ({ selector: "div", rect: [0, 0, 1, 1] })) }).success).toBe(false);
    const { viewport: _viewport, ...missing } = ok;
    expect(qaContextSchema.safeParse(missing).success).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import type { QaContext } from "../../shared/qa";
import { qaReportEmail, qaScreenshotName, qaStamp } from "./qaReport";

const context: QaContext = {
  url: "https://staging.todoi.com/abc2345678?v=board",
  title: "Helicopters Europe website · todoi",
  userAgent: "Mozilla/5.0 (Macintosh) Chrome/142",
  language: "en-US",
  timeZone: "Europe/Brussels",
  sentAt: "2026-11-27T15:04:04.900Z",
  viewport: { width: 1280, height: 800, dpr: 2 },
  screen: { width: 1512, height: 982 },
  appearance: { theme: "minimal", mode: "dark" },
  build: { sha: "0123456789abcdef0123456789abcdef01234567", builtAt: "2026-11-27T10:00:00.000Z" },
  online: true,
  strokes: 2,
  marked: [{ selector: "div.td-card > button.td-btn", label: "Add an item", text: "Add an item", rect: [20.4, 300, 120, 32] }],
  errors: ["TypeError: x is undefined"],
  capture: { ok: true, ms: 310 },
};
const at = new Date("2026-11-27T15:04:05.123Z");
const base = { id: "AAAAAAAAAAAAAAAAAAAAA", name: "Flo", email: "flo@todoi.com", createdAt: at, environment: "staging" as const, appUrl: "https://staging.todoi.com", serverSha: "fedcba9876543210fedcba9876543210fedcba98", context };

describe("the QA note email", () => {
  it("names the screenshot by time and note", () => {
    expect(qaStamp(at)).toBe("2026-11-27T15-04-05Z");
    expect(qaScreenshotName("AAAAAAAAAAAAAAAAAAAAA", at)).toBe("qa-2026-11-27T15-04-05Z-AAAAAAAAAAAAAAAAAAAAA.png");
  });

  it("leads with what was said, then every fact as a line, then the same as JSON", () => {
    const email = qaReportEmail({ ...base, text: "The Add button\njumps when I hover it <b>", screenshot: { filename: "qa.png", url: "https://staging.todoi.com/api/qa-reports/AAAAAAAAAAAAAAAAAAAAA/screenshot", bytes: 204800 } });
    expect(email.subject).toBe("[QA staging] The Add button jumps when I hover it <b>");
    expect(email.text.startsWith("The Add button\njumps when I hover it <b>\n\n--\n")).toBe(true);
    expect(email.text).toContain("From:        Flo <flo@todoi.com>");
    expect(email.text).toContain("Sent:        2026-11-27T15:04:05.123Z (browser clock 2026-11-27T15:04:04.900Z, Europe/Brussels)");
    expect(email.text).toContain("Environment: staging (https://staging.todoi.com)");
    expect(email.text).toContain("Page:        https://staging.todoi.com/abc2345678?v=board");
    expect(email.text).toContain("Viewport:    1280x800 at 2x (screen 1512x982), en-US, online");
    expect(email.text).toContain("Appearance:  theme=minimal mode=dark");
    expect(email.text).toContain("Build:       browser 0123456 (2026-11-27T10:00:00.000Z), server fedcba9");
    expect(email.text).toContain("Screenshot:  qa.png (attached, 200 kB, 2 strokes)");
    expect(email.text).toContain('1. div.td-card > button.td-btn [Add an item] "Add an item" at 20,300,120,32');
    expect(email.text).toContain("- TypeError: x is undefined");
    const json = JSON.parse(email.text.slice(email.text.indexOf("JSON:\n") + 6)) as { id: string; text: string; context: QaContext };
    expect(json).toMatchObject({ id: base.id, text: "The Add button\njumps when I hover it <b>", context: { url: context.url } });
    // Everything a person typed is escaped in the HTML part.
    expect(email.html).toContain("jumps when I hover it &lt;b&gt;");
    expect(email.html).not.toContain("hover it <b>");
  });

  it("says so when there is no text, no screenshot or the page could not be drawn", () => {
    const bare = qaReportEmail({ ...base, text: "  ", screenshot: null, context: { ...context, marked: [], errors: [] } });
    expect(bare.subject).toBe("[QA staging] Drawing without a note");
    expect(bare.text).toContain("Screenshot:  none");
    expect(bare.text).not.toContain("Under the drawing");
    const failed = qaReportEmail({ ...base, text: "x".repeat(200), screenshot: { filename: "qa.png", url: "u", bytes: 10 }, context: { ...context, capture: { ok: false, ms: 5, error: "SecurityError" } } });
    expect(failed.subject).toHaveLength("[QA staging] ".length + 90);
    expect(failed.text).toContain("the page could not be drawn (SecurityError), drawing only");
    const exact = qaReportEmail({ ...base, text: "x", screenshot: { filename: "qa.png", url: "u", bytes: 2048 }, context: { ...context, capture: { ok: true, ms: 900, method: "screen" } } });
    expect(exact.text).toContain("Screenshot:  qa.png (attached, 2 kB, 2 strokes, exact capture of the screen)");
  });
});

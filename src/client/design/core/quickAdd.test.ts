import { describe, expect, it } from "vitest";

import { parseQuickAdd, stripToken } from "./quickAdd";

const TODAY = "2026-08-25"; // Tuesday
const ctx = {
  labels: [{ text: "design", color: "pink" }, "shop"],
  members: [{ name: "Flo Zuallaert", nickname: "flo" }, { name: "Sam Verhoeven" }],
  lists: ["New", "To-do", { name: "Doing", icon: "circle-dot" as const }, "Done"],
  today: TODAY,
};

describe("parseQuickAdd", () => {
  it("parses the full grammar and leaves a clean title", () => {
    const r = parseQuickAdd("Fix login bug #design @sam !high due fri >Doing", ctx);
    expect(r.title).toBe("Fix login bug");
    expect(r.labels).toEqual([{ text: "design", color: "pink", isNew: false }]);
    expect(r.assignee).toBe("Sam Verhoeven");
    expect(r.priority).toBe("High");
    expect(r.due).toBe("2026-08-28");
    expect(r.list).toBe("Doing");
    expect(r.tokens.map((t) => t.kind)).toEqual(["label", "assignee", "priority", "due", "list"]);
  });
  it("creates unknown labels, keeps unknown assignees as text, and ignores unknown lists and priorities", () => {
    const r = parseQuickAdd("Call back #paperwork @nobody !9 >Nowhere", ctx);
    expect(r.labels).toEqual([{ text: "paperwork", color: "teal", isNew: true }]);
    expect(r.assignee).toBe("nobody");
    expect(r.tokens.find((t) => t.kind === "assignee")?.isNew).toBe(true);
    expect(r.priority).toBeNull();
    expect(r.list).toBeNull();
    expect(r.title).toBe("Call back !9 >Nowhere");
  });
  it("matches members by nickname, first name and prefix; lists by prefix", () => {
    expect(parseQuickAdd("x @flo", ctx).assignee).toBe("Flo Zuallaert");
    expect(parseQuickAdd("x @Sam", ctx).assignee).toBe("Sam Verhoeven");
    expect(parseQuickAdd("x @sa", ctx).assignee).toBe("Sam Verhoeven");
    expect(parseQuickAdd("x >to", ctx).list).toBe("To-do");
    expect(parseQuickAdd("x >todo", ctx).list).toBe("To-do");
  });
  it("understands numeric priorities and 'by' dates", () => {
    expect(parseQuickAdd("x !1", ctx).priority).toBe("Urgent");
    expect(parseQuickAdd("x !4", ctx).priority).toBe("Low");
    expect(parseQuickAdd("x by 12 sep", ctx).due).toBe("2026-09-12");
    expect(parseQuickAdd("x due in 3 days", ctx).due).toBe("2026-08-28");
    expect(parseQuickAdd("x due next week", ctx).due).toBe("2026-09-01");
  });
  it("does not treat sigils inside words or unresolvable dates as tokens", () => {
    const r = parseQuickAdd("email@example.com is due whenever", ctx);
    expect(r.tokens).toEqual([]);
    expect(r.title).toBe("email@example.com is due whenever");
  });
  it("stripToken removes one token's span", () => {
    const r = parseQuickAdd("Fix bug #design now", ctx);
    expect(stripToken("Fix bug #design now", r.tokens[0]!)).toBe("Fix bug now");
  });
});

import { describe, expect, it } from "vitest";

import { SHORTCUTS } from "./shortcuts";

const ev = (key: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({ key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods }) as unknown as KeyboardEvent;

describe("SHORTCUTS", () => {
  it("matches single keys only without modifiers", () => {
    expect(SHORTCUTS.is("new-item", ev("n"))).toBe(true);
    expect(SHORTCUTS.is("new-item", ev("n", { ctrlKey: true }))).toBe(false);
    expect(SHORTCUTS.is("new-list", ev("N", { shiftKey: true }))).toBe(true);
    expect(SHORTCUTS.is("help", ev("?", { shiftKey: true }))).toBe(true);
    expect(SHORTCUTS.is("search", ev("/"))).toBe(true);
  });
  it("accepts Ctrl or ⌘ for modified shortcuts", () => {
    expect(SHORTCUTS.is("palette", ev("k", { ctrlKey: true }))).toBe(true);
    expect(SHORTCUTS.is("palette", ev("k", { metaKey: true }))).toBe(true);
    expect(SHORTCUTS.is("palette", ev("k"))).toBe(false);
    expect(SHORTCUTS.is("undo", ev("z"))).toBe(true);
    expect(SHORTCUTS.is("undo", ev("Z", { shiftKey: true }))).toBe(false);
    expect(SHORTCUTS.is("select-all", ev("a", { metaKey: true }))).toBe(true);
  });
  it("derives item actions, focus and selection moves", () => {
    expect(SHORTCUTS.itemAction(ev("d"))).toBe("done");
    expect(SHORTCUTS.itemAction(ev("Backspace"))).toBe("delete");
    expect(SHORTCUTS.itemAction(ev("3"))).toBe("priority-3");
    expect(SHORTCUTS.itemAction(ev("d", { ctrlKey: true }))).toBeNull();
    expect(SHORTCUTS.focusMove(ev("ArrowDown"))).toBe("down");
    expect(SHORTCUTS.focusMove(ev("k"))).toBe("up");
    expect(SHORTCUTS.focusMove(ev("ArrowDown", { shiftKey: true }))).toBeNull();
    expect(SHORTCUTS.selectMove(ev("ArrowDown", { shiftKey: true }))).toBe("down");
    expect(SHORTCUTS.itemMove(ev("ArrowRight", { metaKey: true }))).toBe("right");
    expect(SHORTCUTS.itemMove(ev("ArrowRight"))).toBeNull();
  });
  it("resolves the G chord", () => {
    expect(SHORTCUTS.goTarget("B")).toEqual({ view: "board" });
    expect(SHORTCUTS.goTarget("i")).toEqual({ nav: "inbox" });
    expect(SHORTCUTS.goTarget("q")).toBeNull();
  });
  it("labels keys for the platform and lists every section", () => {
    expect(SHORTCUTS.keyLabel("ctrl")).toBe(SHORTCUTS.isMac ? "⌘" : "ctrl");
    expect(SHORTCUTS.keyLabel("↵")).toBe("↵");
    expect(SHORTCUTS.sections.length).toBeGreaterThan(3);
    for (const s of SHORTCUTS.sections) for (const [keys, desc] of s.rows) {
      expect(keys.length).toBeGreaterThan(0);
      expect(desc.length).toBeGreaterThan(0);
    }
  });
});

import { describe, expect, it } from "vitest";

import { decodeViewState, encodeViewState, sameDefinition, summarizeView, viewStateToQuery } from "./viewState";

describe("view state ↔ URL", () => {
  it("encodes ad-hoc state and decodes it back", () => {
    const state = { view: "board" as const, filters: [{ type: "label", value: "design" }, { type: "priority", value: "High" }], sort: { items: { key: "due", dir: "asc" as const } } };
    const q = encodeViewState(state);
    expect(q).toEqual({ v: "board", f: "label:design,priority:High", s: "items.due.asc" });
    expect(viewStateToQuery(state)).toBe("?v=board&f=label:design,priority:High&s=items.due.asc");
    const back = decodeViewState(q);
    expect(back.view).toBe("board");
    expect(back.filters).toEqual(state.filters);
    expect(back.sort).toEqual({ lists: null, items: { key: "due", dir: "asc" } });
  });
  it("a saved view id replaces the ad-hoc keys", () => {
    expect(encodeViewState({ view: "list", filters: [{ type: "label", value: "x" }], savedView: "sv1" })).toEqual({ view: "sv1" });
    expect(decodeViewState({ view: "sv1" }).savedView).toBe("sv1");
  });
  it("escapes values with separators and ignores junk", () => {
    const q = encodeViewState({ filters: [{ type: "label", value: "a:b,c" }] });
    expect(decodeViewState(q).filters).toEqual([{ type: "label", value: "a:b,c" }]);
    const d = decodeViewState({ v: "nope", f: "broken", s: "x.y.z" });
    expect(d.view).toBeUndefined();
    expect(d.filters).toEqual([]);
    expect(d.sort).toEqual({ lists: null, items: null });
  });
  it("summarises and compares definitions", () => {
    expect(summarizeView({ view: "list", filters: [{ type: "label", value: "design" }], sort: { items: { key: "due", dir: "desc" } } })).toEqual(["List", "design", "Items by due ↓"]);
    expect(sameDefinition({ view: "list", filters: [] }, { view: "list" })).toBe(true);
    expect(sameDefinition({ view: "list" }, { view: "board" })).toBe(false);
  });
});

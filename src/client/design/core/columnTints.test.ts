import { describe, expect, it } from "vitest";

import { COLUMN_TINTS, ColumnTints } from "./columnTints";

describe("ColumnTints", () => {
  it("has 20 tints, ids 1 to 20 in order, each at least 60° of hue from the one before", () => {
    expect(COLUMN_TINTS.map((t) => t.id)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    for (let i = 1; i < COLUMN_TINTS.length; i++) {
      const d = Math.abs(COLUMN_TINTS[i]!.hue - COLUMN_TINTS[i - 1]!.hue) % 360;
      expect(Math.min(d, 360 - d)).toBeGreaterThanOrEqual(60);
    }
  });

  it("index wraps whole numbers into 1 to 20 and rejects the rest", () => {
    expect(ColumnTints.index(1)).toBe(1);
    expect(ColumnTints.index(20)).toBe(20);
    expect(ColumnTints.index(21)).toBe(1);
    expect(ColumnTints.index(45)).toBe(5);
    for (const n of [0, -1, 1.5, Number.NaN, null, undefined]) expect(ColumnTints.index(n)).toBeNull();
  });

  it("assign hands the pool out in the order given and skips lists with a set or suggested role", () => {
    const tints = ColumnTints.assign([
      { id: "a", name: "Ideas" }, // suggested NEW
      { id: "b", name: "Waiting on client" },
      { id: "c", name: "Vendors", statusRole: "TODO" }, // set role
      { id: "d", name: "Backlog" }, // BACKLOG stays neutral
      { id: "e", name: "List 5" }, // the app's placeholder name has no role
      { id: "f", name: "New list 2" },
    ]);
    expect(tints).toEqual({ a: null, b: 1, c: null, d: null, e: 2, f: 3 });
  });

  it("wraps past the pool: the 21st unrecognised list takes tint 1 again", () => {
    const lists = Array.from({ length: 22 }, (_, i) => ({ id: `l${i}`, name: `Client ${String.fromCharCode(65 + i)}` }));
    const tints = ColumnTints.assign(lists);
    expect(tints.l0).toBe(1);
    expect(tints.l19).toBe(20);
    expect(tints.l20).toBe(1);
    expect(tints.l21).toBe(2);
  });
});

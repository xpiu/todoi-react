import { describe, expect, it } from "vitest";

import { moveId, moveProject, orderBy, orderIds } from "./sidebarOrder";

describe("orderIds", () => {
  it("keeps the stored order and drops stale or repeated ids", () => {
    expect(orderIds(["inbox", "gone", "g2", "inbox", "g1"], ["g1", "g2", "projects", "inbox"])).toEqual(["inbox", "g2", "projects", "g1"]);
  });
  it("places an id the stored order lacks right after its default predecessor", () => {
    // g3 is new: after g2 (its predecessor by default), wherever g2 now is
    expect(orderIds(["inbox", "g2", "g1"], ["g1", "g2", "g3", "inbox"])).toEqual(["inbox", "g2", "g3", "g1"]);
    // A new first id goes first
    expect(orderIds(["b"], ["a", "b"])).toEqual(["a", "b"]);
  });
  it("is the default order without a stored one", () => {
    expect(orderIds(undefined, ["a", "b"])).toEqual(["a", "b"]);
  });
});

describe("orderBy / moveId", () => {
  it("sorts rows and moves one id to an index counted without it", () => {
    expect(orderBy([{ id: "a" }, { id: "b" }, { id: "c" }], ["c", "a"]).map((r) => r.id)).toEqual(["c", "a", "b"]);
    expect(moveId(["a", "b", "c"], "a", 2)).toEqual(["b", "c", "a"]);
    expect(moveId(["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"]);
  });
});

describe("moveProject", () => {
  const groups = [
    { id: "g1", projects: [{ id: "p1" }, { id: "p2" }] },
    { id: "g2", projects: [{ id: "p3" }] },
  ];
  it("moves within a group and into another one", () => {
    expect(moveProject(groups, "p1", "g1", 1)[0]!.projects.map((p) => p.id)).toEqual(["p2", "p1"]);
    const across = moveProject(groups, "p2", "g2", 0);
    expect(across.map((g) => g.projects.map((p) => p.id))).toEqual([["p1"], ["p2", "p3"]]);
  });
  it("leaves the groups as they are for an unknown project or group", () => {
    expect(moveProject(groups, "nope", "g1", 0)).toEqual(groups);
    expect(moveProject(groups, "p1", "nope", 0)).toEqual(groups);
  });
});

import { describe, expect, it } from "vitest";

import type { Feature, Unit, UnitKind, UnitStatus } from "../src/engine/types";
import { unitDirection } from "../src/engine/directions";
import { applySelection, featureSelection } from "../src/ui/selection";

const side = { paths: [], exists: true, changed: true, added: false, evidence: [] };
const unit = (id: string, status: UnitStatus, kind: UnitKind = "component") => ({ id, kind, area: "a", name: id, app: side, design: side, status, mergeable: false }) as unknown as Unit;
const feature = (id: string, units: Unit[], directions: Feature["directions"], suggested: Feature["suggested"]): Feature => ({ id, title: id, source: "parts", status: "both", units, appWork: [], designWork: [], directions, suggested });
const choices = (fs: Feature[], global: Feature["suggested"], o: Record<string, Feature["suggested"]>, u: Record<string, Feature["suggested"]>) =>
  Object.fromEntries(fs.flatMap((f) => f.units.map((x) => [x.id, unitDirection(f.directions, x.status, global, o[f.id], u[x.id], x.kind)])));

describe("feature selection", () => {
  const mixed = feature("mixed", [unit("a", "app-ahead"), unit("d", "design-ahead")], ["both", "app-to-design", "design-to-app", "skip"], "both");
  const ref = feature("ref", [unit("r", "design-only", "card")], ["skip"], "skip");

  it("reads all, some, none and reference from the parts that move", () => {
    expect(featureSelection(mixed, { a: "both", d: "both" }).state).toBe("all");
    expect(featureSelection(mixed, { a: "both", d: "skip" })).toEqual({ state: "some", on: 1, total: 2 });
    expect(featureSelection(mixed, {}).state).toBe("none");
    expect(featureSelection(ref, {}).state).toBe("reference");
  });

  it("ticking moves every part, even one that can't follow the feature's direction", () => {
    // the plan pulls into the App: the App-ahead part can't follow, so it gets its own suggestion
    const next = applySelection([mixed], true, "design-to-app", {}, { a: "skip" });
    expect(featureSelection(mixed, choices([mixed], "design-to-app", next.overrides, next.unitOverrides)).state).toBe("all");
    expect(next.unitOverrides).toEqual({ a: "app-to-design" });
  });

  it("unticking skips the feature and drops part directions that would keep it moving", () => {
    const next = applySelection([mixed], false, "both", {}, { a: "app-to-design" });
    expect(next).toEqual({ overrides: { mixed: "skip" }, unitOverrides: {} });
    expect(featureSelection(mixed, choices([mixed], "both", next.overrides, next.unitOverrides)).state).toBe("none");
  });

  it("re-ticking a feature the plan already moves just drops its override", () => {
    expect(applySelection([mixed], true, "both", { mixed: "skip" }, {}).overrides).toEqual({});
  });
});

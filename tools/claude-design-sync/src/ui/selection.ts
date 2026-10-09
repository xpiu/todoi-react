// Which features the plan includes: a feature counts as selected by the parts it would move.
import { directionsFor, effective, isReference, unitDirection, type Direction, type Feature, type Unit } from "./api";

/** A part the plan could move; reference-only parts never move */
export const movable = (u: Unit) => directionsFor(u.status, u.kind).directions.some((d) => d !== "skip");

/** `on` of `total` movable parts are planned to move */
export interface Selection {
  state: "all" | "some" | "none" | "reference";
  on: number;
  total: number;
}

export function featureSelection(f: Feature, unitChoices: Record<string, Direction>): Selection {
  const parts = f.units.filter(movable);
  const on = parts.filter((u) => (unitChoices[u.id] ?? "skip") !== "skip").length;
  const state = !parts.length || f.units.every(isReference) ? "reference" : on === parts.length ? "all" : on ? "some" : "none";
  return { state, on, total: parts.length };
}

/** The direction ticking a feature gives it: the plan's, else the feature's suggestion, else whatever it allows */
export function includeDirection(f: Feature, global: Direction): Direction {
  const d = effective(f, global);
  if (d !== "skip") return d;
  return f.suggested !== "skip" && f.directions.includes(f.suggested) ? f.suggested : (f.directions.find((x) => x !== "skip") ?? "skip");
}

/**
 * Tick or untick whole features. Hand-set part directions that contradict the tick are dropped, and a
 * ticked part that can't follow its feature's direction gets its own suggestion, so every part moves.
 */
export function applySelection(fs: Feature[], on: boolean, global: Direction, overrides: Record<string, Direction>, unitOverrides: Record<string, Direction>) {
  const features = { ...overrides };
  const units = { ...unitOverrides };
  for (const f of fs) {
    const nd = on ? includeDirection(f, global) : "skip";
    if (nd === effective(f, global)) delete features[f.id];
    else features[f.id] = nd;
    for (const u of f.units) {
      if (u.id in units && (units[u.id] === "skip") === on) delete units[u.id];
      if (on && movable(u) && unitDirection(f.directions, u.status, global, features[f.id], units[u.id], u.kind) === "skip") units[u.id] = directionsFor(u.status, u.kind).suggested;
    }
  }
  return { overrides: features, unitOverrides: units };
}

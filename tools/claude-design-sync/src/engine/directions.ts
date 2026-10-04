// Which directions make sense, and what a feature or a single subfeature ends up doing. Pure, so the
// engine, the server and the GUI share one answer.
import type { Direction, UnitKind, UnitStatus } from "./types";

/** Kinds that exist only in Design (previews, guidelines): shown as Design work, never ported */
export const REFERENCE_KINDS: UnitKind[] = ["card", "guideline"];

export function directionsFor(status: UnitStatus, kind?: UnitKind): { directions: Direction[]; suggested: Direction } {
  if (kind && REFERENCE_KINDS.includes(kind)) return { directions: ["skip"], suggested: "skip" };
  switch (status) {
    case "both":
      return { directions: ["both", "app-to-design", "design-to-app", "skip"], suggested: "both" };
    case "app-ahead":
    case "app-only":
      return { directions: ["both", "app-to-design", "skip"], suggested: "app-to-design" };
    case "design-ahead":
    case "design-only":
      return { directions: ["both", "design-to-app", "skip"], suggested: "design-to-app" };
    default:
      return { directions: ["skip"], suggested: "skip" };
  }
}

/** A feature's direction under the plan-wide choice, honouring what the feature allows */
export function featureDirection(allowed: Direction[], global: Direction, override?: Direction): Direction {
  const want = override ?? global;
  return want === "skip" || !allowed.includes(want) ? "skip" : want;
}

/** A subfeature follows its feature as far as it can (nothing to pull from a side that didn't move), unless set itself */
export function unitDirection(featureAllowed: Direction[], status: UnitStatus, global: Direction, featureOverride?: Direction, unitOverride?: Direction, kind?: UnitKind): Direction {
  const allowed = directionsFor(status, kind).directions;
  if (unitOverride) return allowed.includes(unitOverride) ? unitOverride : "skip";
  const fd = featureDirection(featureAllowed, global, featureOverride);
  return allowed.includes(fd) ? fd : "skip";
}

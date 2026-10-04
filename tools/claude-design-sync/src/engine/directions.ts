// Which directions make sense, and what a feature or a single subfeature ends up doing. Pure, so the
// engine, the server and the GUI share one answer.
import type { Direction, UnitStatus } from "./types";

export function directionsFor(status: UnitStatus): { directions: Direction[]; suggested: Direction } {
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
export function unitDirection(featureAllowed: Direction[], status: UnitStatus, global: Direction, featureOverride?: Direction, unitOverride?: Direction): Direction {
  const allowed = directionsFor(status).directions;
  if (unitOverride) return allowed.includes(unitOverride) ? unitOverride : "skip";
  const fd = featureDirection(featureAllowed, global, featureOverride);
  return allowed.includes(fd) ? fd : "skip";
}

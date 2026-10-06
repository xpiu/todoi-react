// Shared shapes for the engine, the server API and the UI.

export type Side = "app" | "design";
export type UnitKind = "component" | "tokens" | "spec" | "screen" | "card" | "guideline";

/** How one unit moved since the sync point */
export type UnitStatus =
  | "in-sync" // neither side changed
  | "app-ahead" // only the App changed
  | "design-ahead" // only Design changed
  | "both" // both changed: needs a merge
  | "app-only" // exists only in the App (new there, or never ported)
  | "design-only" // exists only in Design
  | "unknown"; // no baseline for one side, so drift can't be dated

export type Direction = "both" | "app-to-design" | "design-to-app" | "skip";

export interface SideState {
  /** Files that make up the unit on this side (repo- or project-relative) */
  paths: string[];
  exists: boolean;
  /** Content changed since the sync point (null = no baseline to compare against) */
  changed: boolean | null;
  /** The unit did not exist at the sync point */
  added: boolean;
  /** Short, human evidence lines: commit subjects, "3 props added", "12 Minimal rules" */
  evidence: string[];
  /** Exported names / props found on this side (for cross-checks) */
  props?: string[];
}

export interface Unit {
  id: string;
  kind: UnitKind;
  area: string;
  name: string;
  app: SideState;
  design: SideState;
  status: UnitStatus;
  /** Both sides speak the same language (token CSS), so a deterministic merge exists */
  mergeable: boolean;
  /** Kept open at the sync point (skipped, not synced): the older baseline it's still compared against */
  heldFrom?: Baseline;
  /** App files a Design-only reference corresponds to (a kit screen's App screen): read side by side, never written */
  related?: string[];
  /** A kit page that renders a Design reference (a screen's interactive kit app), relative to the project */
  preview?: string;
}

export interface Feature {
  id: string;
  title: string;
  /** Where the title came from: a commit subject, a preview card, an area */
  source: "commit" | "card" | "area" | "spec";
  status: UnitStatus;
  units: Unit[];
  /** Commit subjects (App) and card names / spec headings (Design) behind this feature */
  appWork: string[];
  designWork: string[];
  /** Directions that make sense for this feature (e.g. nothing to pull when Design did not move) */
  directions: Direction[];
  suggested: Direction;
}

/** Where a comparison starts: the App's git rev and the Design snapshot taken with it */
export interface Baseline {
  rev: string;
  designSnapshot: string | null;
  label: string;
}

export interface SyncPoint {
  id: string;
  label: string;
  /** Git rev of the App at this sync point */
  rev: string;
  /** Design snapshot taken at this sync point (null when none was kept) */
  designSnapshot: string | null;
  createdAt: string;
  /** Units kept open when this point was recorded, by unit id: they keep comparing against their older baseline */
  held?: Record<string, Baseline>;
}

export interface SnapshotMeta {
  id: string;
  label: string;
  source: "pull" | "import" | "upload";
  createdAt: string;
  /** The Claude Design project it was taken from (unknown for an imported export) */
  projectId?: string;
  /** Design project's updatedAt when the snapshot was taken, when known (never set on an incomplete pull) */
  projectUpdatedAt?: string;
  fileCount: number;
  /** The snapshot an upload's snapshot was derived from (its changed files are what went up) */
  parent?: string;
  /** A pull that couldn't fetch every file: `carried` came from the previous snapshot (`from`), `missing` had no earlier copy */
  unpulled?: { carried: string[]; missing: string[]; from?: string };
}

export interface Comparison {
  base: SyncPoint | null;
  appRev: string;
  appHead: string;
  designSnapshot: SnapshotMeta | null;
  features: Feature[];
  units: Unit[];
  counts: Record<UnitStatus, number>;
  generatedAt: string;
}

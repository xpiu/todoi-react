// Typed calls to the local server, and the words the GUI uses for statuses and directions.
import { appMoved, designMoved, directionsFor } from "../engine/directions";
import type { Comparison, Direction, SnapshotMeta, SyncPoint, Unit, UnitStatus } from "../engine/types";
import type { Job, JobEvent } from "../server/jobs";
import type { MeterState } from "../server/meter";
import type { PlanRequest, RunRequest } from "../server/requests";
import type { HarnessInfo } from "../engine/harness";
import type { ExportFile } from "../engine/snapshots";
import type { Step } from "../engine/plan";
import type { LaneRule } from "../engine/lanes";
import type { MappingEvent } from "../server/mapping";
import type { Theme as VisualTheme, VisualComparison } from "../engine/visual";

export type { Comparison, Direction, Feature, SnapshotMeta, SyncPoint, Unit, UnitStatus } from "../engine/types";
export type { Job, JobEvent, StepState } from "../server/jobs";
export type { Burning, MeterState } from "../server/meter";
export type { Step } from "../engine/plan";
export type { LaneId, LaneRule, Technique } from "../engine/lanes";
export type { Flow, MappingEvent, Move } from "../server/mapping";

export type { HarnessInfo } from "../engine/harness";
export type { VisualComparison, VisualTheme };

export interface AppState {
  project: { id: string; name: string };
  repo: string;
  appHead: string;
  dirty: boolean;
  syncPoints: SyncPoint[];
  snapshots: SnapshotMeta[];
  snapshotRoot: string;
  /** codex only when config.json picks it (untested) */
  harnesses: { claude: HarnessInfo; codex?: HarnessInfo };
  implement: "claude" | "codex";
  /** Tries per App port before the run sets it aside */
  implementAttempts: number;
  /** What must pass on a run's App branch before it can be merged */
  check: string;
  jobs: Array<Omit<Job, "events">>;
  fake: boolean;
}

/** What the Mapping page adds to the state and the comparison */
export interface MappingData {
  lanes: LaneRule[];
  history: MappingEvent[];
  /** The last time Claude Design was asked whether it changed, while this server has run (`archive`: taken from that archive instead) */
  lastCheck: { at: string; updatedAt: string | null; stale: boolean; archive?: string } | null;
  app: { branch: string | null; commitsSinceBase: number | null };
}

/** An import, and whether it holds Design's last change (null: Claude Design hasn't been asked yet) */
export interface Imported {
  snapshot: SnapshotMeta;
  covers: boolean | null;
}

/** Exports of the project waiting in Downloads, and what a pull cost last time */
export interface ExportsInfo {
  exports: Array<ExportFile & { covers: boolean | null }>;
  designUpdatedAt: string | null;
  checkedAt: string | null;
  lastPull: { at: string; costUsd: number | null; seconds: number | null } | null;
  folders: string[];
}

/** Kit files that differ between two snapshots (the first ones listed) */
export interface ArchiveChanges {
  count: number;
  files: string[];
}

/** The newest Project archive, what it changed, and whether the comparison reads it alone */
export interface ArchiveReport {
  archive: SnapshotMeta | null;
  /** Snapshots taken after it (pulls, uploads), which the comparison reads instead */
  newer?: SnapshotMeta[];
  sinceArchive?: (ArchiveChanges & { snapshot: SnapshotMeta }) | null;
  sinceBase?: (ArchiveChanges & { syncPoint: SyncPoint }) | null;
  /** The comparison was last updated from this archive alone, without asking Claude Design */
  basis?: { snapshot: string; at: string } | null;
}

/** An archive made the only Design source; `setAside`: the newer snapshots it replaced */
export interface ArchiveUsed {
  snapshot: SnapshotMeta;
  promoted: boolean;
  setAside: SnapshotMeta[];
  comparedAt: string;
}

/** A refused request, with the rest of the server's answer (e.g. the files a resume would set aside) */
export type ApiError = Error & { data?: Record<string, unknown> };

async function readResponse<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw Object.assign(new Error(data.error ?? `${res.status} ${res.statusText}`), { data }) as ApiError;
  return data;
}

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: { "content-type": "application/json", "x-cds": "1" },
    body: init?.body ? JSON.stringify(init.body) : init?.method === "POST" ? "{}" : undefined,
  });
  return readResponse<T>(res);
}

export const api = {
  state: () => call<AppState>("/api/state"),
  compare: (base?: string | null, fresh = false) => call<Comparison>(`/api/compare?${new URLSearchParams({ ...(base ? { base } : {}), ...(fresh ? { fresh: "1" } : {}) })}`),
  diff: (unit: string, side: "app" | "design", base?: string | null) => call<{ text: string }>(`/api/diff?${new URLSearchParams({ unit, side, ...(base ? { base } : {}) })}`),
  plan: (base: string | null, global: Direction, overrides: Record<string, Direction>, unitOverrides: Record<string, Direction>) => call<{ steps: Step[]; choices: Record<string, Direction>; units: Record<string, Direction> }>("/api/plan", { body: { base, global, overrides, unitOverrides } satisfies PlanRequest }),
  run: (base: string | null, global: Direction, overrides: Record<string, Direction>, unitOverrides: Record<string, Direction>, only?: string[]) => call<{ job: string }>("/api/run", { body: { base, global, overrides, unitOverrides, only } satisfies RunRequest }),
  pull: (force = false) => call<{ job: string }>("/api/pull", { body: { force } }),
  statusCheck: () => call<{ updatedAt: string | null; snapshotUpdatedAt: string | null; stale: boolean }>("/api/status-check", { method: "POST" }),
  importExport: (path: string) => call<Imported>("/api/import", { body: { path } }),
  /** A .zip picked or dropped in the browser; its lastModified is the download time */
  importFile: async (file: File): Promise<Imported> => {
    const res = await fetch(`/api/import-file?${new URLSearchParams({ name: file.name, modified: String(file.lastModified) })}`, { method: "POST", headers: { "content-type": "application/zip", "x-cds": "1" }, body: file });
    return readResponse<Imported>(res);
  },
  exports: () => call<ExportsInfo>("/api/exports"),
  archive: (base?: string | null) => call<ArchiveReport>(`/api/archive?${new URLSearchParams(base ? { base } : {})}`),
  /** Make an archive (default: the newest) the only Design source and recompare against it. No tokens */
  useArchive: (base: string | null, snapshot?: string) => call<ArchiveUsed>("/api/archive/use", { body: { base, snapshot } }),
  /** `hold`: unit ids kept open, still compared against their baseline under `base` */
  setProject: (project: string) => call<{ project: { id: string; name: string } }>("/api/project", { body: { project } }),
  syncPoint: (label: string, tag: boolean, base: string | null, hold: string[]) => call<{ syncPoint: SyncPoint }>("/api/sync-point", { body: { label, tag, base, hold } }),
  job: (id: string) => call<Job>(`/api/jobs/${id}`),
  /** Check the ticked files against Claude Design, then hand their upload to Claude Code */
  upload: (id: string, paths: string[]) => call<{ ok: true }>(`/api/jobs/${id}/upload`, { body: { paths } }),
  /** Read the handed-off files back from Claude Design; the upload step closes once all match */
  uploadCheck: (id: string) => call<{ ok: true }>(`/api/jobs/${id}/upload-check`, { method: "POST" }),
  /** `setAside`: move edits made after the last saved step into a patch first (refused resumes list them as `drift`) */
  resume: (id: string, setAside = false) => call<{ ok: true }>(`/api/jobs/${id}/resume`, { body: { setAside } }),
  /** Stop the running step now and park the run there, keeping its stage and branch, until Resume */
  pause: (id: string) => call<{ ok: true }>(`/api/jobs/${id}/pause`, { method: "POST" }),
  cancel: (id: string) => call<{ ok: true }>(`/api/jobs/${id}/cancel`, { method: "POST" }),
  /** `reviewed`: the developer confirmed their review of a draft (required for runs that ported kit code) */
  merge: (id: string, reviewed = false) => call<{ ok: true }>(`/api/jobs/${id}/merge`, { body: { reviewed } }),
  discard: (id: string) => call<{ ok: true }>(`/api/jobs/${id}/discard`, { method: "POST" }),
  /** Pictures of a component: its Storybook stories and the kit cards that show it (slow the first time: builds Storybook) */
  visual: (unit: string, base?: string | null) => call<VisualComparison>("/api/visual", { body: { unit, base } }),
  mapping: (base?: string | null) => call<MappingData>(`/api/mapping?${new URLSearchParams(base ? { base } : {})}`),
  /** The Claude Code calls the server has running and what finished ones cost (the bar's flame) */
  meter: () => call<MeterState>("/api/meter"),
};

/** Decode the job/event protocol once; closing a subscription also ignores queued callbacks. */
export function subscribeJob(id: string, onJob: (job: Job, event?: JobEvent) => void): () => void {
  const es = new EventSource(`/api/jobs/${id}/events`);
  let live = true;
  // the log arrives whole once, then entry by entry; updates leave it out, so it's kept here
  let events: JobEvent[] = [];
  const read = <T,>(e: Event) => JSON.parse((e as MessageEvent).data) as T;
  es.addEventListener("job", (e) => {
    if (!live) return;
    const job = read<Job>(e);
    events = job.events;
    onJob(job);
  });
  es.addEventListener("update", (e) => {
    if (live) onJob({ ...read<Job>(e), events });
  });
  es.addEventListener("event", (e) => {
    if (!live) return;
    const { job, event } = read<{ job: Job; event: JobEvent }>(e);
    events = [...events, event].slice(-2000);
    onJob({ ...job, events }, event);
  });
  return () => {
    live = false;
    es.close();
  };
}

/** Follow a job until it stops running; `onJob` sees every update (progress, steps). */
export function followJob(id: string, onJob: (j: Job) => void = () => {}): Promise<Job> {
  return new Promise((resolve) => {
    const off = subscribeJob(id, (job) => {
      onJob(job);
      if (job.state === "running") return;
      off();
      resolve(job);
    });
  });
}

/** Per-browser memory (the chosen sync point, directions); a private window just forgets */
export const store = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem(k);
      return v ? (JSON.parse(v) as T) : d;
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* private window */
    }
  },
};

export const STATUS_WORD: Record<UnitStatus, string> = {
  "in-sync": "in sync",
  "app-ahead": "App ahead",
  "design-ahead": "Design ahead",
  both: "changed on both",
  "app-only": "new in App",
  "design-only": "new in Design",
  unknown: "not dated",
};

// Names say where the work lands, so they agree with the rail's arrows (App is the left column, Design the right)
export const DIRECTION_LABEL: Record<Direction, string> = {
  both: "Full sync",
  "app-to-design": "Into Design",
  "design-to-app": "Into the App",
  skip: "Skip",
};

// What each direction writes to: the jobs differ by which side ends up changed
export const DIRECTION_SUB: Record<Direction, string> = {
  both: "changes both sides",
  "app-to-design": "changes only Design",
  "design-to-app": "changes only the App",
  skip: "changes nothing",
};

export const DIRECTION_HINT: Record<Direction, string> = {
  both: "Both ways: App work goes to Design and Design work comes to the App",
  "app-to-design": "One way: port the App's work into the Claude Design kit",
  "design-to-app": "One way: port the kit's work into the App",
  skip: "Leave this as it is",
};

export { appMoved, designMoved, directionsFor, featureDirection, REFERENCE_KINDS, unitDirection } from "../engine/directions";
import { REFERENCE_KINDS } from "../engine/directions";
export { parseProjectRef, projectUrl } from "../engine/project";
export { appPending, isDraft, REVIEW_POINTS, uploadPending, type FidelityFinding } from "../engine/approvals";
import { featureDirection } from "../engine/directions";
export const effective = (f: { directions: Direction[] }, global: Direction, override?: Direction) => featureDirection(f.directions, global, override);

/** Spec headings arrive as written in the spec (often capitals); show them in sentence case */
export function displayName(u: { kind: string; name: string }): string {
  if (u.kind !== "spec" || !/\b[A-Z]{2,}\b/.test(u.name)) return u.name;
  // all-caps words go lower case (keeping short acronyms like UI/API), then the first letter is capitalised
  const t = u.name.replace(/\b[A-Z][A-Z&]+\b/g, (w) => (w.length <= 3 ? w : w.toLowerCase()));
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Design references (previews, screens, guidelines) are read, never ported */
export const isReference = (u: { kind: string }) => (REFERENCE_KINDS as string[]).includes(u.kind);
export const REFERENCE_NOTE = "Design references are read, never ported.";

export const KIND_WORD: Record<string, string> = { component: "component", tokens: "tokens", spec: "spec", screen: "screen", card: "preview card", guideline: "guideline" };

export const fmtTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
/** Features by the side that moved: only the App, only Design, or both */
export function featureTally(features: Array<{ status: UnitStatus }>) {
  const t = { app: 0, design: 0, both: 0 };
  for (const f of features) {
    if (f.status === "both") t.both++;
    else if (appMoved(f.status)) t.app++;
    else if (designMoved(f.status)) t.design++;
  }
  return t;
}
export const archiveName = (snapshot: SnapshotMeta) => snapshot.archive?.name ?? snapshot.label.replace(/^Imported /, "");
export { plural } from "../engine/words";
export { isProjectArchive, isStoryFile as isStoryPath } from "../engine/paths";

/** Default acknowledgement scope: selected work, or an entirely reference-only feature. */
export function selectedUnitIds(units: Unit[], choices: Record<string, Direction>) {
  const selected = units.filter((u) => choices[u.id] && choices[u.id] !== "skip");
  return (units.every((u) => directionsFor(u.status, u.kind).directions.length === 1) ? units : selected).map((u) => u.id);
}

// Typed calls to the local server, and the words the GUI uses for statuses and directions.
import type { Comparison, Direction, SnapshotMeta, SyncPoint, UnitStatus } from "../engine/types";
import type { Job, JobEvent } from "../server/jobs";
import type { PlanRequest, RunRequest } from "../server/requests";
import type { HarnessInfo } from "../engine/harness";
import type { Step } from "../engine/plan";
import type { LaneRule } from "../engine/lanes";
import type { MappingEvent } from "../server/mapping";

export type { Comparison, Direction, Feature, SnapshotMeta, SyncPoint, Unit, UnitStatus } from "../engine/types";
export type { Job, JobEvent, StepState } from "../server/jobs";
export type { Step } from "../engine/plan";
export type { LaneId, LaneRule, Technique } from "../engine/lanes";
export type { Flow, MappingEvent, Move } from "../server/mapping";

export type { HarnessInfo } from "../engine/harness";

export interface AppState {
  project: { id: string; name: string };
  repo: string;
  appHead: string;
  dirty: boolean;
  syncPoints: SyncPoint[];
  snapshots: SnapshotMeta[];
  /** codex only when config.json picks it (untested) */
  harnesses: { claude: HarnessInfo; codex?: HarnessInfo };
  implement: "claude" | "codex";
  /** What must pass on a run's App branch before it can be merged */
  check: string;
  jobs: Array<Omit<Job, "events">>;
  fake: boolean;
}

/** What the Mapping page adds to the state and the comparison */
export interface MappingData {
  lanes: LaneRule[];
  history: MappingEvent[];
  /** The last time Claude Design was asked whether it changed, while this server has run */
  lastCheck: { at: string; updatedAt: string | null; stale: boolean } | null;
  app: { branch: string | null; commitsSinceBase: number | null };
}

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: { "content-type": "application/json", "x-cds": "1" },
    body: init?.body ? JSON.stringify(init.body) : init?.method === "POST" ? "{}" : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `${res.status} ${res.statusText}`);
  return data;
}

export const api = {
  state: () => call<AppState>("/api/state"),
  compare: (base?: string | null, fresh = false) => call<Comparison>(`/api/compare?${new URLSearchParams({ ...(base ? { base } : {}), ...(fresh ? { fresh: "1" } : {}) })}`),
  diff: (unit: string, side: "app" | "design", base?: string | null) => call<{ text: string }>(`/api/diff?${new URLSearchParams({ unit, side, ...(base ? { base } : {}) })}`),
  plan: (base: string | null, global: Direction, overrides: Record<string, Direction>, unitOverrides: Record<string, Direction>) => call<{ steps: Step[]; choices: Record<string, Direction>; units: Record<string, Direction> }>("/api/plan", { body: { base, global, overrides, unitOverrides } satisfies PlanRequest }),
  run: (base: string | null, global: Direction, overrides: Record<string, Direction>, unitOverrides: Record<string, Direction>, only?: string[]) => call<{ job: string }>("/api/run", { body: { base, global, overrides, unitOverrides, only } satisfies RunRequest }),
  pull: (force = false) => call<{ job: string }>("/api/pull", { body: { force } }),
  statusCheck: () => call<{ updatedAt: string | null; snapshotUpdatedAt: string | null; stale: boolean }>("/api/status-check", { method: "POST" }),
  importExport: (path: string) => call<{ snapshot: SnapshotMeta }>("/api/import", { body: { path } }),
  /** `hold`: unit ids kept open, still compared against their baseline under `base` */
  setProject: (project: string) => call<{ project: { id: string; name: string } }>("/api/project", { body: { project } }),
  syncPoint: (label: string, tag: boolean, base: string | null, hold: string[]) => call<{ syncPoint: SyncPoint }>("/api/sync-point", { body: { label, tag, base, hold } }),
  job: (id: string) => call<Job>(`/api/jobs/${id}`),
  upload: (id: string, paths: string[]) => call<{ ok: true }>(`/api/jobs/${id}/upload`, { body: { paths } }),
  cancel: (id: string) => call<{ ok: true }>(`/api/jobs/${id}/cancel`, { method: "POST" }),
  merge: (id: string) => call<{ ok: true }>(`/api/jobs/${id}/merge`, { method: "POST" }),
  discard: (id: string) => call<{ ok: true }>(`/api/jobs/${id}/discard`, { method: "POST" }),
  mapping: (base?: string | null) => call<MappingData>(`/api/mapping?${new URLSearchParams(base ? { base } : {})}`),
};

/** Decode the job/event protocol once; closing a subscription also ignores queued callbacks. */
export function subscribeJob(id: string, onJob: (job: Job, event?: JobEvent) => void): () => void {
  const es = new EventSource(`/api/jobs/${id}/events`);
  let live = true;
  es.addEventListener("job", (e) => {
    if (live) onJob(JSON.parse((e as MessageEvent).data) as Job);
  });
  es.addEventListener("event", (e) => {
    if (!live) return;
    const { job, event } = JSON.parse((e as MessageEvent).data) as { job: Job; event: JobEvent };
    onJob(job, event);
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
export { parseProjectRef, projectUrl } from "../engine/project";
export { appPending, uploadPending } from "../engine/approvals";
import { featureDirection } from "../engine/directions";
export const effective = (f: { directions: Direction[] }, global: Direction, override?: Direction) => featureDirection(f.directions, global, override);

/** Spec headings arrive as written in the spec (often capitals); show them in sentence case */
export function displayName(u: { kind: string; name: string }): string {
  if (u.kind !== "spec" || !/\b[A-Z]{2,}\b/.test(u.name)) return u.name;
  // all-caps words go lower case (keeping short acronyms like UI/API), then the first letter is capitalised
  const t = u.name.replace(/\b[A-Z][A-Z&]+\b/g, (w) => (w.length <= 3 ? w : w.toLowerCase()));
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export const KIND_WORD: Record<string, string> = { component: "component", tokens: "tokens", spec: "spec", screen: "screen", card: "preview card", guideline: "guideline" };

export const fmtTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
export const plural = (n: number, w: string, p = `${w}s`) => `${n} ${n === 1 ? w : p}`;

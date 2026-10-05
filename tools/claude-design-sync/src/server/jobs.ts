// Long-running work (pulls, plan runs, uploads) as jobs with an event log the GUI streams.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";

import type { Ctx } from "../engine/config";

export type JobKind = "pull" | "status" | "run" | "upload";
export type JobState = "running" | "awaiting-upload" | "done" | "failed" | "cancelled";

export interface JobEvent {
  at: string;
  level: "info" | "step" | "ai" | "tool" | "warn" | "error" | "done";
  text: string;
  stepId?: string;
}

export interface StepState {
  id: string;
  title: string;
  kind: string;
  target: "app" | "design";
  state: "pending" | "running" | "done" | "failed" | "skipped";
  summary?: string;
}

export interface Job {
  id: string;
  kind: JobKind;
  title: string;
  state: JobState;
  startedAt: string;
  endedAt?: string;
  events: JobEvent[];
  steps: StepState[];
  progress?: { done: number; total: number };
  /** Run jobs: the staging folder and the files waiting for upload approval */
  stage?: string;
  /** `conflict`: why uploading this file would overwrite newer Design work (set by the pre-upload check) */
  staged?: Array<{ path: string; status: "new" | "changed"; conflict?: string }>;
  cards?: Array<{ card: string; errors: string[] }>;
  costUsd?: number;
  result?: string;
  baseId?: string | null;
  snapshotId?: string | null;
}

type Listener = (e: { job: Job; event?: JobEvent }) => void;

export class Jobs {
  private jobs = new Map<string, Job>();
  private listeners = new Map<string, Set<Listener>>();
  private aborts = new Map<string, AbortController>();
  constructor(private ctx: Ctx) {
    const dir = this.dir();
    if (existsSync(dir)) for (const f of readdirSync(dir)) {
      if (!f.endsWith(".json")) continue;
      try {
        const j = JSON.parse(readFileSync(join(dir, f), "utf8")) as Job;
        if (j.state === "running") j.state = "failed";
        this.jobs.set(j.id, j);
      } catch {
        /* ignore a torn file */
      }
    }
    // staging copies only live while their run waits for upload approval
    const stages = join(this.ctx.state, "stage");
    const keep = new Set(this.list().filter((j) => j.state === "awaiting-upload" && j.stage).map((j) => resolve(j.stage!)));
    if (existsSync(stages)) for (const d of readdirSync(stages)) if (!keep.has(resolve(stages, d))) rmSync(join(stages, d), { recursive: true, force: true });
  }
  /** Delete a finished run's staging copy (a full copy of the Design project) */
  private dropStage(j: Job) {
    const stages = resolve(this.ctx.state, "stage") + sep;
    if (j.stage && resolve(j.stage).startsWith(stages)) rmSync(j.stage, { recursive: true, force: true });
  }
  private dir() {
    return join(this.ctx.state, "jobs");
  }
  private persist(j: Job) {
    mkdirSync(this.dir(), { recursive: true });
    writeFileSync(join(this.dir(), `${j.id}.json`), JSON.stringify(j));
  }
  list(): Job[] {
    return [...this.jobs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }
  get(id: string) {
    return this.jobs.get(id);
  }
  running(): Job | undefined {
    return this.list().find((j) => j.state === "running");
  }
  create(kind: JobKind, title: string, extra: Partial<Job> = {}): Job {
    const id = `${kind}-${Date.now().toString(36)}`;
    const j: Job = { id, kind, title, state: "running", startedAt: new Date().toISOString(), events: [], steps: [], ...extra };
    this.jobs.set(id, j);
    this.aborts.set(id, new AbortController());
    this.persist(j);
    this.emit(j);
    return j;
  }
  signal(id: string) {
    return this.aborts.get(id)?.signal;
  }
  cancel(id: string) {
    this.aborts.get(id)?.abort();
    const j = this.jobs.get(id);
    if (j && j.state === "running") this.finish(j, "cancelled", "Stopped by you");
  }
  /** Give up on a run that waits for approval: nothing more is written anywhere, and its staging copy goes */
  discard(id: string): boolean {
    const j = this.jobs.get(id);
    if (!j || j.state !== "awaiting-upload") return false;
    if (j.steps.some((s) => s.id === "upload")) this.step(j, "upload", { state: "skipped", summary: "Discarded" });
    this.finish(j, "cancelled", "Discarded: nothing was uploaded");
    return true;
  }
  log(j: Job, level: JobEvent["level"], text: string, stepId?: string) {
    const event: JobEvent = { at: new Date().toISOString(), level, text: text.slice(0, 4000), stepId };
    j.events.push(event);
    if (j.events.length > 2000) j.events.splice(0, j.events.length - 2000);
    this.persist(j);
    this.emit(j, event);
  }
  update(j: Job, patch: Partial<Job>) {
    Object.assign(j, patch);
    this.persist(j);
    this.emit(j);
  }
  step(j: Job, id: string, patch: Partial<StepState>) {
    const s = j.steps.find((x) => x.id === id);
    if (s) Object.assign(s, patch);
    this.persist(j);
    this.emit(j);
  }
  finish(j: Job, state: JobState, result?: string) {
    if (j.state !== "running" && j.state !== "awaiting-upload") return;
    j.state = state;
    j.result = result;
    if (state !== "awaiting-upload") {
      j.endedAt = new Date().toISOString();
      this.dropStage(j);
    }
    this.persist(j);
    this.emit(j, { at: new Date().toISOString(), level: state === "failed" ? "error" : "done", text: result ?? state });
  }
  subscribe(id: string, fn: Listener) {
    const set = this.listeners.get(id) ?? new Set();
    set.add(fn);
    this.listeners.set(id, set);
    return () => set.delete(fn);
  }
  private emit(job: Job, event?: JobEvent) {
    for (const fn of this.listeners.get(job.id) ?? []) fn({ job, event });
    for (const fn of this.listeners.get("*") ?? []) fn({ job, event });
  }
}

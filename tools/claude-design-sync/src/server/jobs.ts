// Long-running work (pulls, plan runs, uploads) as jobs with an event log the GUI streams.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";

import type { Ctx } from "../engine/config";
import { appPending, uploadPending } from "../engine/approvals";
import { removeWorktree, type AppRun } from "../engine/worktree";

export type JobKind = "pull" | "status" | "run" | "upload";
export type JobState = "running" | "awaiting-approval" | "done" | "failed" | "cancelled";

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
  /** Staged files the tool wrote itself, not the AI: drafts from the App's Storybook (then maybe refined by the AI), and Minimal twins */
  origin?: Record<string, "storybook" | "storybook-refined" | "twin">;
  /** Why a staged file deserves a look before it goes up (a twin that couldn't follow its card, render errors, a draft without its component) */
  fileNotes?: Record<string, string>;
  /** Staged files left unticked at first, for the reason in `fileNotes` */
  holdBack?: string[];
  /**
   * The upload handed to an interactive Claude Code session, where DesignSync's plan prompt can be
   * approved: the files, the request to paste, and whether Design was untouched since the run's snapshot
   * when the files were checked (then a clean read-back may date the next snapshot)
   */
  handoff?: { paths: string[]; prompt: string; command: string; fresh: boolean; at: string };
  /** Run jobs: the parts the plan moves, and the label of the sync point recorded once all of it is verified */
  covers?: string[];
  label?: string;
  /** The sync point this run recorded on its own */
  syncPointId?: string;
  costUsd?: number;
  result?: string;
  baseId?: string | null;
  snapshotId?: string | null;
  /** App-side work: the worktree and branch it ran in, its verified commits, the check, and the merge */
  app?: AppRun;
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
        if ((j.state as string) === "awaiting-upload") j.state = "awaiting-approval"; // the name before App merges waited too
        if (j.state === "running") j.state = "failed";
        if (j.app?.state === "working") Object.assign(j.app, { state: "failed", reason: "The tool stopped while the port was running" });
        this.jobs.set(j.id, j);
      } catch {
        /* ignore a torn file */
      }
    }
    // staging copies only live while their run waits for upload approval
    const stages = join(this.ctx.state, "stage");
    const keep = new Set(this.list().filter((j) => j.state === "awaiting-approval" && j.stage).map((j) => resolve(j.stage!)));
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
  /**
   * Give up on what a run still holds: its staged kit files (nothing is uploaded) and its App branch
   * (worktree and branch deleted, nothing merged). Works on a waiting run, and on a failed run's kept branch.
   */
  discard(id: string): boolean {
    const j = this.jobs.get(id);
    if (!j || !(j.state === "awaiting-approval" || appPending(j))) return false;
    const notes: string[] = [];
    if (j.app && appPending(j)) {
      removeWorktree(this.ctx, j.app, true);
      j.app.state = "discarded";
      notes.push(`branch ${j.app.branch} deleted, nothing merged`);
    }
    if (uploadPending(j)) {
      this.step(j, "upload", { state: "skipped", summary: "Discarded" });
      notes.push("nothing uploaded");
    }
    const text = `Discarded: ${notes.join("; ") || "nothing was left waiting"}`;
    if (j.state === "awaiting-approval") this.finish(j, "cancelled", text);
    else this.log(j, "done", text);
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
    if (j.state !== "running" && j.state !== "awaiting-approval") return;
    j.state = state;
    j.result = result;
    if (state !== "awaiting-approval") {
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

// Long-running work (pulls, plan runs, uploads) as jobs with an event log the GUI streams.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

import type { Comparison } from "../engine/types";
import type { Step } from "../engine/plan";
import type { HarnessKind } from "../engine/harness";
import type { Adaptation } from "../engine/adaptation";
import type { AlreadyImplemented } from "../engine/worktree";
import type { Ctx } from "../engine/config";
import { appPending, canResume, keepsRunFiles, uploadPending } from "../engine/approvals";
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
  alreadyImplemented?: AlreadyImplemented;
  adaptation?: Adaptation;
  /** A port that still failed after its tries: the patch its partial changes were saved in (the branch went back to before it) */
  setAside?: { patch: string; files: string[] };
  /** Every attempt survives retries; unknown runtime settings remain absent, never guessed. */
  attempts?: Array<{
    harness: HarnessKind;
    requestedModel?: string;
    requestedEffort?: string;
    maxTurns?: number;
    startedAt: string;
    endedAt?: string;
    models: string[];
    efforts: string[];
    turns?: number;
    costUsd?: number;
    stopReason?: string;
    error?: string;
  }>;
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


export interface SavedPlan { comparison: Comparison; steps: Step[]; harness: HarnessKind }

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
    this.sweep();
  }
  /**
   * Delete what only an unfinished run needs, for every run that has finished: Design staging copies (live while
   * their run runs or waits), saved plans and set-aside patches (kept while the run can resume or holds a kept
   * branch), and spec sections no kept plan's brief names and no brief used for a day. Returns what went.
   */
  sweep(): string[] {
    // best effort: an unreadable folder or a file in use never fails the job that triggered the sweep
    const removed: string[] = [];
    const drop = (path: string) => {
      try {
        rmSync(path, { recursive: true, force: true });
        removed.push(path);
      } catch {
        /* left for the next sweep */
      }
    };
    const entries = (dir: string) => {
      try {
        return readdirSync(dir);
      } catch {
        return [];
      }
    };
    const unused = (path: string, before: number) => {
      try {
        return statSync(path).mtimeMs < before;
      } catch {
        return false;
      }
    };
    const stages = join(this.ctx.state, "stage");
    const staged = new Set(this.list().filter((j) => (j.state === "running" || j.state === "awaiting-approval") && j.stage).map((j) => resolve(j.stage!)));
    for (const d of entries(stages)) if (!staged.has(resolve(stages, d))) drop(join(stages, d));
    const kept = (id: string) => {
      const j = this.jobs.get(id);
      return !!j && keepsRunFiles(j);
    };
    const plans = join(this.ctx.state, "plans");
    for (const f of entries(plans)) if (!kept(f.replace(/\.json(\.tmp)?$/, ""))) drop(join(plans, f));
    const setAside = join(this.ctx.state, "set-aside");
    for (const d of entries(setAside)) if (!kept(d)) drop(join(setAside, d));
    // briefs name spec sections by path; a section file is rewritten (or touched) whenever a plan uses it
    const briefs = entries(plans).map((f) => {
      try {
        return readFileSync(join(plans, f), "utf8");
      } catch {
        return "";
      }
    }).join("\n");
    const sections = join(this.ctx.state, "sections");
    const dayAgo = Date.now() - 86_400_000;
    for (const f of entries(sections)) if (!briefs.includes(f) && unused(join(sections, f), dayAgo)) drop(join(sections, f));
    return removed;
  }
  /** Sweep when a run ends or lets go of its branch, and say in its log what of its own went */
  private tidy(j: Job) {
    const own = this.sweep().filter((p) => p.split(sep).some((seg) => seg === j.id || seg === `${j.id}.json`));
    const stageGone = own.some((p) => p.includes(`${sep}stage${sep}`));
    const patches = own.some((p) => p.includes(`${sep}set-aside${sep}`));
    const plan = own.some((p) => p.includes(`${sep}plans${sep}`));
    const what = [stageGone && "its Design staging copy", plan && "its saved plan", patches && "its set-aside patches"].filter(Boolean);
    if (what.length) this.log(j, "info", `Removed what only an unfinished run needs: ${what.join(", ")}`);
  }
  private dir() {
    return join(this.ctx.state, "jobs");
  }
  private persist(j: Job) {
    this.writeJson(join(this.dir(), `${j.id}.json`), j);
  }
  /** Replace complete files atomically so a stopped process cannot tear a checkpoint. */
  private writeJson(path: string, data: unknown) {
    mkdirSync(dirname(path), { recursive: true });
    const temp = `${path}.tmp`;
    writeFileSync(temp, JSON.stringify(data));
    renameSync(temp, path);
  }
  savePlan(j: Job, plan: SavedPlan) {
    this.writeJson(join(this.ctx.state, "plans", `${j.id}.json`), plan);
  }
  plan(j: Job): SavedPlan | null {
    const path = join(this.ctx.state, "plans", `${j.id}.json`);
    return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) as SavedPlan : null;
  }
  resume(j: Job) {
    if (!canResume(j)) throw new Error("This run cannot be resumed");
    this.aborts.set(j.id, new AbortController());
    j.state = "running";
    j.endedAt = undefined;
    j.result = undefined;
    if (j.app) Object.assign(j.app, { state: "working", reason: undefined, check: undefined, review: undefined });
    for (const step of j.steps) if (step.state !== "done" || step.kind === "check" || step.kind === "merge") {
      // Older runs recorded validation failures only in the step summary.
      const attempt = step.attempts?.at(-1);
      if (step.state === "failed" && attempt && step.summary) attempt.error ??= step.summary;
      Object.assign(step, { state: "pending", summary: undefined, alreadyImplemented: undefined, setAside: undefined });
    }
    this.update(j, {});
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
    // Jobs created in the same millisecond would otherwise share an id, and the later one overwrite the other's file.
    const stamp = `${kind}-${Date.now().toString(36)}`;
    let id = stamp;
    for (let n = 2; this.jobs.has(id); n++) id = `${stamp}-${n}`;
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
    else {
      this.log(j, "done", text);
      this.tidy(j);
    }
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
    if (state !== "awaiting-approval") j.endedAt = new Date().toISOString();
    this.persist(j);
    this.emit(j, { at: new Date().toISOString(), level: state === "failed" ? "error" : "done", text: result ?? state });
    this.tidy(j);
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

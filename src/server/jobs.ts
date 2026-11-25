// Durable background jobs on Postgres (the `jobs` table): Git syncs from webhooks and the scheduled
// reconcile, the Trash purge, upload cleanup and receipt pruning. Every API process runs a worker; due
// jobs are claimed with FOR UPDATE SKIP LOCKED, so processes never run the same job twice, and a claim
// expires so a crashed process's job runs again. A failure retries with exponential backoff until
// `maxAttempts`, then stays "failed" with its error for the admin view. A `key` is unique among queued
// jobs: enqueueing work that is already waiting does nothing. Recurring jobs (`every`) live in the same
// table, so a schedule survives restarts and is shared by all processes.
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { db } from "./db";
import { jobs, type Job } from "./db/schema";
import { recordError } from "./services/errorTracking";

export interface JobDefinition<P> {
  run: (payload: P, job: Job) => Promise<void>;
  /** @default 5 */
  maxAttempts?: number;
  /** How long a claim lasts before another process may take the job over @default 5 minutes */
  timeoutMs?: number;
}
const handlers = new Map<string, JobDefinition<never>>();

/** Register what a kind of job does. Kinds are registered once, at startup (src/server/jobKinds.ts). */
export function defineJob<P extends Record<string, unknown>>(kind: string, def: JobDefinition<P>) {
  handlers.set(kind, def as JobDefinition<never>);
}

/** Retry delay after the nth failed attempt: 30 s, 1, 2, 4 … minutes, at most an hour. */
export const backoffMs = (attempts: number) => Math.min(3_600_000, 30_000 * 2 ** Math.max(0, attempts - 1));

let wake: (() => void) | null = null;

/** Queue a job. With a `key`, nothing happens while the same key is already queued (returns false). */
export async function enqueue(kind: string, payload: Record<string, unknown> = {}, opts: { key?: string; runAt?: Date; repeatMs?: number; maxAttempts?: number } = {}): Promise<boolean> {
  const rows = await db
    .insert(jobs)
    .values({ id: nanoid(), kind, key: opts.key ?? null, payload, runAt: opts.runAt ?? new Date(), repeatMs: opts.repeatMs ?? null, maxAttempts: opts.maxAttempts ?? handlers.get(kind)?.maxAttempts ?? 5 })
    .onConflictDoNothing({ target: jobs.key, where: sql`${jobs.state} = 'queued'` })
    .returning({ id: jobs.id });
  if (rows.length && (!opts.runAt || opts.runAt.getTime() <= Date.now())) wake?.();
  return rows.length > 0;
}

/** A job that runs every `ms`, starting now unless one is already waiting. */
export const every = (kind: string, ms: number, payload: Record<string, unknown> = {}) => enqueue(kind, payload, { key: `every:${kind}`, repeatMs: ms });

/** Claim up to `limit` due jobs (and ones whose claim ran out). */
async function claim(limit: number): Promise<Job[]> {
  const res = await db.execute<Record<string, unknown>>(sql`
    update ${jobs} set state = 'running', attempts = attempts + 1, locked_until = now() + interval '5 minutes', updated_at = now()
    where id in (
      select id from ${jobs}
      where (state = 'queued' and run_at <= now()) or (state = 'running' and locked_until < now())
      order by run_at limit ${limit}
      for update skip locked
    )
    returning id`);
  const ids = res.rows.map((r) => String(r.id));
  if (!ids.length) return [];
  return db.select().from(jobs).where(inArray(jobs.id, ids));
}

async function finish(job: Job, error: unknown) {
  const now = new Date();
  if (!error) {
    await db.update(jobs).set({ state: "done", finishedAt: now, lockedUntil: null, lastError: null }).where(eq(jobs.id, job.id));
  } else {
    const message = error instanceof Error ? error.message : String(error);
    const retry = job.attempts < job.maxAttempts;
    if (!retry) {
      console.error(JSON.stringify({ level: "error", msg: "job failed for good", kind: job.kind, jobId: job.id, attempts: job.attempts, error: message }));
      void recordError({ source: "job", kind: error instanceof Error ? error.name : "Error", message, where: job.kind, stack: error instanceof Error ? error.stack : null });
    }
    try {
      await db.update(jobs).set(retry ? { state: "queued", runAt: new Date(now.getTime() + backoffMs(job.attempts)), lockedUntil: null, lastError: message } : { state: "failed", finishedAt: now, lockedUntil: null, lastError: message }).where(eq(jobs.id, job.id));
    } catch {
      // The same work was queued again meanwhile (its key is taken): that copy runs instead.
      await db.update(jobs).set({ state: "done", finishedAt: now, lockedUntil: null, lastError: `${message} (superseded)` }).where(eq(jobs.id, job.id));
    }
  }
  // A recurring job comes back after its interval, whatever happened this time.
  if (job.repeatMs && (!error || job.attempts >= job.maxAttempts)) await enqueue(job.kind, job.payload, { key: job.key ?? undefined, runAt: new Date(now.getTime() + job.repeatMs), repeatMs: job.repeatMs, maxAttempts: job.maxAttempts });
}

/** Run what is due now; returns how many jobs ran. The worker calls this; tests call it directly. */
export async function runDueJobs(limit = 10): Promise<number> {
  const claimed = await claim(limit);
  await Promise.all(
    claimed.map(async (job) => {
      const def = handlers.get(job.kind);
      let error: unknown = def ? null : new Error(`No handler for job kind "${job.kind}"`);
      if (def) {
        try {
          await def.run(job.payload as never, job);
        } catch (e) {
          error = e;
        }
      }
      await finish(job, error);
    }),
  );
  return claimed.length;
}

/** Done jobs are kept a week (the admin view shows recent work), failed ones a month. */
export async function pruneJobs() {
  await db.delete(jobs).where(and(eq(jobs.state, "done"), lt(jobs.finishedAt, sql`now() - interval '7 days'`)));
  await db.delete(jobs).where(and(eq(jobs.state, "failed"), lt(jobs.finishedAt, sql`now() - interval '30 days'`)));
}

/** Poll for due jobs every `intervalMs`, and at once when this process queues one. Returns stop(). */
export function startWorker(intervalMs = 5_000): () => void {
  let running = false, again = false, stopped = false;
  const tick = async () => {
    if (stopped) return;
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      // Keep going while there is work (and the worker wasn't stopped), then wait for the next tick.
      for (;;) {
        const ran = await runDueJobs();
        if (!ran || stopped) break;
        again = false;
      }
    } catch (e) {
      console.error(JSON.stringify({ level: "error", msg: "job worker tick failed", error: String(e) }));
    } finally {
      running = false;
      if (again && !stopped) {
        again = false;
        void tick();
      }
    }
  };
  wake = () => void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  void tick();
  return () => {
    stopped = true;
    wake = null;
    clearInterval(timer);
  };
}

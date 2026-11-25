// The durable job queue against a real database: runs, retries with backoff, gives up, dedupes by key,
// repeats on schedule, recovers a crashed claim, never runs a job twice in parallel — and the jobs built
// on it: the Trash purge and the Git sync reconcile.
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";

import { TRASH_RETENTION_DAYS } from "../shared/enums";
import { db } from "./db";
import { gitConnections, groups, items, jobs, lists, projects, users } from "./db/schema";
import { defineJobs } from "./jobKinds";
import { backoffMs, defineJob, enqueue, every, runDueJobs } from "./jobs";
import { purgeTrash } from "./services/lifecycle";

const jobOf = async (id: string) => (await db.select().from(jobs).where(eq(jobs.id, id)))[0]!;
const only = async (kind: string) => db.select().from(jobs).where(eq(jobs.kind, kind));

describe("job queue", () => {
  it("runs a due job once and marks it done", async () => {
    const seen: unknown[] = [];
    defineJob<{ n: number }>("t-run", { run: async (p) => void seen.push(p.n) });
    await enqueue("t-run", { n: 7 });
    await enqueue("t-run", { n: 8 }, { runAt: new Date(Date.now() + 60_000) });
    await runDueJobs(50);
    expect(seen).toEqual([7]);
    expect((await only("t-run")).map((j) => j.state).sort()).toEqual(["done", "queued"]);
  });

  it("retries with backoff, then gives up and keeps the error", async () => {
    defineJob("t-fail", { maxAttempts: 2, run: async () => { throw new Error("GitHub didn't answer"); } });
    await enqueue("t-fail");
    await runDueJobs(50);
    let [j] = await only("t-fail");
    expect(j).toMatchObject({ state: "queued", attempts: 1, lastError: "GitHub didn't answer" });
    expect(j!.runAt.getTime()).toBeGreaterThan(Date.now() + backoffMs(1) - 5_000);
    await db.update(jobs).set({ runAt: new Date() }).where(eq(jobs.id, j!.id));
    await runDueJobs(50);
    [j] = await only("t-fail");
    expect(j).toMatchObject({ state: "failed", attempts: 2 });
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(20)).toBe(3_600_000);
  });

  it("dedupes by key while queued, and repeats a recurring job", async () => {
    let runs = 0;
    defineJob("t-every", { run: async () => void runs++ });
    expect(await every("t-every", 60_000)).toBe(true);
    expect(await every("t-every", 60_000)).toBe(false);
    await runDueJobs(50);
    expect(runs).toBe(1);
    const all = await only("t-every");
    expect(all.map((j) => j.state).sort()).toEqual(["done", "queued"]);
    const next = all.find((j) => j.state === "queued")!;
    expect(next.runAt.getTime()).toBeGreaterThan(Date.now() + 55_000);
  });

  it("takes over a job whose claim ran out (a crashed process)", async () => {
    let runs = 0;
    defineJob("t-crash", { run: async () => void runs++ });
    await enqueue("t-crash");
    const [j] = await only("t-crash");
    await db.update(jobs).set({ state: "running", attempts: 1, lockedUntil: sql`now() - interval '1 minute'` }).where(eq(jobs.id, j!.id));
    await runDueJobs(50);
    expect(runs).toBe(1);
    expect(await jobOf(j!.id)).toMatchObject({ state: "done", attempts: 2 });
  });

  it("never runs the same job twice when workers race", async () => {
    let runs = 0;
    defineJob("t-race", { run: async () => { runs++; await new Promise((r) => setTimeout(r, 50)); } });
    for (let i = 0; i < 5; i++) await enqueue("t-race", { i });
    await Promise.all([runDueJobs(5), runDueJobs(5), runDueJobs(5)]);
    expect(runs).toBe(5);
  });
});

describe("jobs built on it", () => {
  async function owner() {
    const userId = nanoid(), groupId = nanoid();
    await db.insert(users).values({ id: userId, name: "Jobs", email: `${userId}@example.test` });
    await db.insert(groups).values({ id: groupId, name: "G", keyPrefix: "JB", ownerId: userId });
    return { userId, groupId };
  }

  it("purges what has been in the Trash longer than the promise, and keeps the rest", async () => {
    const { groupId } = await owner();
    const old = new Date(Date.now() - (TRASH_RETENTION_DAYS + 1) * 86_400_000), recent = new Date(Date.now() - 10 * 86_400_000);
    const keep = nanoid(), purge = nanoid(), listId = nanoid();
    await db.insert(projects).values([{ id: keep, groupId, name: "Keep" }, { id: purge, groupId, name: "Old", deletedAt: old }]);
    await db.insert(lists).values({ id: listId, projectId: keep, name: "L" });
    const parent = nanoid();
    await db.insert(items).values([
      { id: parent, projectId: keep, listId, title: "Old parent", deletedAt: old },
      { id: nanoid(), projectId: keep, listId, parentItemId: parent, title: "Its subitem" },
      { id: nanoid(), projectId: keep, listId, title: "Recently trashed", deletedAt: recent },
      { id: nanoid(), projectId: keep, listId, title: "Live" },
    ]);
    expect(await purgeTrash()).toEqual({ items: 1, projects: 1 });
    expect((await db.select({ title: items.title }).from(items).where(eq(items.projectId, keep))).map((r) => r.title).sort()).toEqual(["Live", "Recently trashed"]);
    expect(await db.select().from(projects).where(eq(projects.id, purge))).toEqual([]);
  });

  it("reconciles every auto-sync connection that isn't waiting for a person", async () => {
    defineJobs();
    const { userId, groupId } = await owner();
    const conn = async (over: Partial<typeof gitConnections.$inferInsert>) => {
      const projectId = nanoid(), id = nanoid();
      await db.insert(projects).values({ id: projectId, groupId, name: "P" });
      await db.insert(gitConnections).values({ id, projectId, owner: "acme", repo: "r", branch: "main", path: "p.md", format: "embridge", tokenCipher: "v1.x.x.x", tokenHint: "…", createdBy: userId, ...over });
      return id;
    };
    const auto = await conn({}), paused = await conn({ state: "conflict" }), manual = await conn({ autoSync: false });
    await enqueue("git-reconcile");
    await runDueJobs(50);
    const queued = (await only("git-sync")).filter((j) => j.state === "queued").map((j) => j.payload.connectionId);
    expect(queued).toContain(auto);
    expect(queued).not.toContain(paused);
    expect(queued).not.toContain(manual);
  });
});

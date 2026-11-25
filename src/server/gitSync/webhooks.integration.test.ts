// Inbound GitHub webhooks against the fake GitHub and a real database: the hook is registered with its
// own secret, a signed push that touches the file syncs the project, and everything else is refused or
// ignored without a sync.
import { createHmac, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { startFakeGithub } from "../../../tests/fakes/fakeGithub";
import { app } from "../app";
import { db } from "../db";
import { gitConnections, gitSyncRuns, groups, items, jobs, lists, members, projects, users } from "../db/schema";
import { env } from "../env";
import { connectProject, syncConnection } from "./engine";
import { open } from "./secrets";
import { defineJobs, enqueueGitSync } from "../jobKinds";
import { runDueJobs } from "../jobs";
import { handleWebhook, registerWebhook, webhookUrl } from "./webhooks";

const REPO = "acme/hooks";
const TOKEN = "github_pat_webhook_test_0000000001";
let fake: Awaited<ReturnType<typeof startFakeGithub>>;
beforeAll(async () => {
  fake = await startFakeGithub();
  env.GITHUB_API_URL = fake.url;
  // GitHub's deliveries from the fake go nowhere (port 9 discards): the tests deliver by hand, signed.
  env.APP_URL = "http://127.0.0.1:9";
  fake.control.addToken(TOKEN, { login: "flo", repos: [REPO], push: true });
  fake.control.addRepo(REPO);
  defineJobs();
});
afterAll(() => fake.close());

async function connected(path = `${nanoid(6)}.md`) {
  const userId = nanoid(), groupId = nanoid(), projectId = nanoid(), listId = nanoid();
  await db.insert(users).values({ id: userId, name: "Hook test", email: `${userId}@example.test` });
  await db.insert(groups).values({ id: groupId, name: "G", keyPrefix: "WH", ownerId: userId, nextItemNumber: 2 });
  await db.insert(projects).values({ id: projectId, groupId, name: "Hooks" });
  await db.insert(lists).values({ id: listId, projectId, name: "To-do", statusRole: "TODO" });
  await db.insert(items).values({ id: nanoid(), projectId, listId, title: "First", keyNumber: 1 });
  await db.insert(members).values({ projectId, userId, role: "owner" });
  const { connection } = await connectProject({ projectId, token: TOKEN, owner: "acme", repo: "hooks", branch: "main", path, format: "embridge", mode: "store" }, userId);
  expect(await registerWebhook(connection, TOKEN)).toBe(true);
  const [c] = await db.select().from(gitConnections).where(eq(gitConnections.id, connection.id));
  return { c: c!, projectId, secret: open(c!.hookSecretCipher!)! };
}
const push = (path: string, over: Record<string, unknown> = {}) => JSON.stringify({ ref: "refs/heads/main", after: randomUUID(), repository: { full_name: REPO }, commits: [{ modified: [path] }], ...over });
const sign = (secret: string, body: string) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
const headers = (secret: string, body: string, event = "push") => ({ event, delivery: randomUUID(), signature: sign(secret, body) });

describe("GitHub webhooks", () => {
  it("registers a hook with its own sealed secret, where GitHub can reach Todoi", async () => {
    const { c, secret } = await connected();
    expect(webhookUrl()).toBe("http://127.0.0.1:9/api/webhooks/github");
    expect(c.hookId).toBeGreaterThan(0);
    expect(c.hookSecretCipher).not.toContain(secret);
    expect([...fake.control.repo(REPO)!.hooks.values()].some((h) => h.secret === secret)).toBe(true);
  });

  it("syncs the project when a signed push touches the file", async () => {
    const { c, secret, projectId } = await connected();
    const text = fake.control.file(REPO, "main", c.path)!.text.replace("- [ ] First", "- [x] First");
    await fake.control.push(REPO, "main", c.path, text);
    const body = push(c.path);
    const started: Array<Promise<unknown>> = [];
    const out = await handleWebhook(headers(secret, body), body, (id) => {
      const p = syncConnection(id, "webhook", null).then(() => undefined);
      started.push(p);
      return p;
    });
    expect(out).toEqual({ status: 202, synced: [c.id] });
    await Promise.all(started);
    const [row] = await db.select().from(items).where(eq(items.projectId, projectId));
    expect(row!.done).toBe(true);
    const [run] = await db.select().from(gitSyncRuns).where(eq(gitSyncRuns.connectionId, c.id)).orderBy(gitSyncRuns.createdAt).then((r) => r.slice(-1));
    expect(run).toMatchObject({ trigger: "webhook", outcome: "pulled" });
  });

  it("refuses what it can't verify, and ignores pushes that don't concern the file", async () => {
    const { c, secret } = await connected();
    const none = async () => {
      throw new Error("must not sync");
    };
    const body = push(c.path);
    expect(await handleWebhook({ event: "push", signature: sign("wrong secret", body) }, body, none)).toEqual({ status: 401 });
    expect(await handleWebhook({ event: "push" }, body, none)).toEqual({ status: 401 });
    const elsewhere = JSON.stringify({ ...JSON.parse(body), repository: { full_name: "acme/other" } });
    expect(await handleWebhook(headers(secret, elsewhere), elsewhere, none)).toEqual({ status: 401 });
    expect(await handleWebhook(headers(secret, "{not json"), "{not json", none)).toEqual({ status: 400 });
    const otherFile = push("README.md");
    expect(await handleWebhook(headers(secret, otherFile), otherFile, none)).toEqual({ status: 202, synced: [] });
    const otherBranch = push(c.path, { ref: "refs/heads/dev" });
    expect(await handleWebhook(headers(secret, otherBranch), otherBranch, none)).toEqual({ status: 202, synced: [] });
    const ping = JSON.stringify({ zen: "Keep it logically awesome.", repository: { full_name: REPO } });
    expect(await handleWebhook(headers(secret, ping, "ping"), ping, none)).toEqual({ status: 200, synced: [] });
    // A repeated delivery id is answered without a second sync.
    const once = headers(secret, body);
    expect((await handleWebhook(once, body, async () => undefined)).status).toBe(202);
    expect(await handleWebhook(once, body, none)).toEqual({ status: 200, synced: [] });
  });

  it("skips Todoi's own commit coming back", async () => {
    const { c, secret } = await connected();
    const [last] = await db.select().from(gitSyncRuns).where(eq(gitSyncRuns.connectionId, c.id));
    const body = push(c.path, { after: last!.commitSha });
    expect(await handleWebhook(headers(secret, body), body, async () => {
      throw new Error("must not sync");
    })).toEqual({ status: 202, synced: [] });
  });

  it("answers over HTTP: 202 for a verified push, 401 unsigned, 413 too big", async () => {
    const { c, secret } = await connected();
    const body = push(c.path);
    const post = (b: string, h: Record<string, string>) => app.request("/api/webhooks/github", { method: "POST", headers: { "content-type": "application/json", ...h }, body: b });
    const ok = await post(body, { "x-github-event": "push", "x-github-delivery": randomUUID(), "x-hub-signature-256": sign(secret, body) });
    expect(ok.status).toBe(202);
    expect(await ok.json()).toEqual({ syncing: 1 });
    expect((await post(body, { "x-github-event": "push" })).status).toBe(401);
    const big = JSON.stringify({ repository: { full_name: REPO }, pad: "x".repeat(1024 * 1024 + 10) });
    expect((await post(big, { "x-github-event": "push", "x-hub-signature-256": sign(secret, big) })).status).toBe(413);
    // The 202 queued a durable sync; the worker runs it.
    const [queued] = await db.select().from(jobs).where(eq(jobs.key, `git-sync:${c.id}`));
    expect(queued).toMatchObject({ kind: "git-sync", state: "queued", payload: { connectionId: c.id, trigger: "webhook" } });
    await runDueJobs(50);
    expect((await db.select().from(jobs).where(eq(jobs.id, queued!.id)))[0]!.state).toBe("done");
  });

  it("coalesces a burst into one queued sync", async () => {
    const { c } = await connected();
    expect(await enqueueGitSync(c.id, "webhook")).toBe(true);
    expect(await enqueueGitSync(c.id, "webhook")).toBe(false);
    expect(await db.select().from(jobs).where(eq(jobs.key, `git-sync:${c.id}`))).toHaveLength(1);
    await runDueJobs(50);
  });
});

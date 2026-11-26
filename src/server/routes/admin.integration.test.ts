// Error tracking and the operator console: faults are grouped (ids and numbers don't split a problem),
// a resolved problem reopens when it happens again, the browser can report what broke, and only
// confirmed operators see the console — with accounts, the job queue, Git sync health and errors.
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { beforeAll, describe, expect, it } from "vitest";

import { call, confirmEmail, signUp, type Person } from "../../../tests/integration/accounts";
import { db } from "../db";
import { errorGroups, gitConnections, groups, jobs, projects, users } from "../db/schema";
import { env } from "../env";
import { onError } from "../errors";
import { fingerprintOf, normalizeMessage, recordError } from "../services/errorTracking";

let operator: Person, unconfirmed: Person, member: Person;
beforeAll(async () => {
  [operator, unconfirmed, member] = await Promise.all([signUp("Operator"), signUp("Unconfirmed operator"), signUp("Member")]);
  await confirmEmail(operator);
  env.ADMIN_EMAILS = [operator.email, unconfirmed.email];
});

describe("error tracking", () => {
  it("groups the same problem, whatever ids and numbers it mentions, and reopens a resolved one", async () => {
    expect(normalizeMessage("Item 4hMbbqFb6CHl0SJ8bSEhJ not found after 3 tries")).toBe("Item :id not found after # tries");
    const e = { source: "server" as const, kind: "Error", where: "GET /api/items/:id" };
    await recordError({ ...e, message: "Item 4hMbbqFb6CHl0SJ8bSEhJ not found after 3 tries", requestId: "r1" });
    await recordError({ ...e, message: "Item XXXXXXXXXXXXXXXXXXXXX not found after 4 tries", requestId: "r2" });
    const fp = fingerprintOf({ ...e, message: "Item x not found" });
    const [g] = await db.select().from(errorGroups).where(eq(errorGroups.fingerprint, fingerprintOf({ ...e, message: "Item 4hMbbqFb6CHl0SJ8bSEhJ not found after 3 tries" })));
    expect(g).toMatchObject({ count: 2, lastRequestId: "r2", resolvedAt: null });
    expect(fp).not.toBe(g!.fingerprint);
    await db.update(errorGroups).set({ resolvedAt: new Date() }).where(eq(errorGroups.fingerprint, g!.fingerprint));
    await recordError({ ...e, message: "Item 4hMbbqFb6CHl0SJ8bSEhJ not found after 9 tries" });
    expect((await db.select().from(errorGroups).where(eq(errorGroups.fingerprint, g!.fingerprint)))[0]).toMatchObject({ count: 3, resolvedAt: null });
  });

  it("records a route's fault through the shared error handler, with its route and request id", async () => {
    const boom = new Hono().get("/api/boom/:id", () => {
      throw new TypeError("Cannot read properties of undefined (reading 'title')");
    });
    boom.onError(onError);
    const res = await boom.request("/api/boom/abc");
    expect(res.status).toBe(500);
    await new Promise((r) => setTimeout(r, 50));
    const [g] = await db.select().from(errorGroups).where(eq(errorGroups.where, "GET /api/boom/:id"));
    expect(g).toMatchObject({ source: "server", kind: "TypeError", message: "Cannot read properties of undefined (reading 'title')" });
    expect(g!.sample).toContain("TypeError");
  });

  it("takes reports from the browser, without page content", async () => {
    const res = await call("/api/errors", { cookie: member.cookie, json: { kind: "TypeError", message: "x is not a function", stack: "TypeError: x is not a function\n    at render (app.js:1:2)", path: "/p/4hMbbqFb6CHl0SJ8bSEhJ?item=abc" } });
    expect(res.status).toBe(204);
    const [g] = await db.select().from(errorGroups).where(eq(errorGroups.where, "/p/:id"));
    expect(g).toMatchObject({ source: "client", kind: "TypeError", lastUserId: member.id });
    expect((await call("/api/errors", { cookie: member.cookie, json: { message: "", path: "/" } })).status).toBe(400);
  });
});

describe("operator console", () => {
  it("is for confirmed operators only", async () => {
    expect((await call("/api/admin/overview", { cookie: member.cookie })).status).toBe(403);
    expect((await call("/api/admin/overview", { cookie: unconfirmed.cookie })).status).toBe(403);
    expect((await call("/api/admin/overview", { cookie: operator.cookie })).status).toBe(200);
    expect((await (await call("/api/me", { cookie: operator.cookie })).json()).operator).toBe(true);
    expect((await (await call("/api/me", { cookie: member.cookie })).json()).operator).toBe(false);
  });

  it("shows accounts, the job queue, Git sync health and errors, and resolves and retries", async () => {
    const jobId = nanoid();
    await db.insert(jobs).values({ id: jobId, kind: "git-sync", state: "failed", attempts: 5, lastError: "GitHub didn't answer", finishedAt: new Date() });
    const groupId = nanoid(), projectId = nanoid();
    await db.insert(groups).values({ id: groupId, name: "G", keyPrefix: "AD", ownerId: member.id });
    await db.insert(projects).values({ id: projectId, groupId, name: "Failing sync" });
    await db.insert(gitConnections).values({ id: nanoid(), projectId, owner: "acme", repo: "plans", branch: "main", path: "p.md", format: "embridge", tokenCipher: "v1.x.x.x", tokenHint: "…", state: "error", lastError: "GitHub didn't accept the token" });
    const body = await (await call("/api/admin/overview", { cookie: operator.cookie })).json();
    expect(body.accounts).toMatchObject({ registered: expect.any(Number), verified: expect.any(Number) });
    expect(body.accounts.registered).toBeGreaterThanOrEqual(3);
    expect(body.jobs.recentFailures).toContainEqual(expect.objectContaining({ id: jobId, kind: "git-sync", lastError: "GitHub didn't answer" }));
    expect(body.gitSync.failing).toContainEqual(expect.objectContaining({ project: "Failing sync", repo: "plans", lastError: "GitHub didn't accept the token" }));
    expect(body.errors.length).toBeGreaterThan(0);

    const open = body.errors.find((e: { resolvedAt: string | null }) => !e.resolvedAt);
    expect((await call(`/api/admin/errors/${open.fingerprint}/resolve`, { cookie: operator.cookie, json: {} })).status).toBe(204);
    expect((await call(`/api/admin/errors/${open.fingerprint}/resolve`, { cookie: operator.cookie, json: {} })).status).toBe(404);
    expect((await call(`/api/admin/jobs/${jobId}/retry`, { cookie: operator.cookie, json: {} })).status).toBe(204);
    expect((await db.select().from(jobs).where(eq(jobs.id, jobId)))[0]).toMatchObject({ state: "queued", attempts: 0 });

    const found = await (await call(`/api/admin/accounts?q=${encodeURIComponent(member.email)}`, { cookie: operator.cookie })).json();
    expect(found.accounts).toEqual([expect.objectContaining({ email: member.email, guest: false, projects: 0 })]);
  });

  it("lets an operator confirm an address by hand, once, while email can't be delivered", async () => {
    const tester = await signUp("Tester");
    const confirm = (cookie: string) => call(`/api/admin/accounts/${tester.id}/confirm-email`, { cookie, method: "POST" });
    expect((await confirm(member.cookie)).status).toBe(403);
    expect((await confirm(operator.cookie)).status).toBe(204);
    expect((await confirm(operator.cookie)).status).toBe(404);
    const [row] = await db.select({ verified: users.emailVerified }).from(users).where(eq(users.id, tester.id));
    expect(row?.verified).toBe(true);
  });
});

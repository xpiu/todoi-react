// Git sync over HTTP: who may see, sync and connect; the token never comes back; input is checked.
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { call, confirmEmail, signUp, type Person } from "../../../tests/integration/accounts";
import { startFakeGithub } from "../../../tests/fakes/fakeGithub";
import { db } from "../db";
import { groups, items, lists, members, projects } from "../db/schema";
import { env } from "../env";

const TOKEN = "github_pat_route_test_000000000001";
let fake: Awaited<ReturnType<typeof startFakeGithub>>;
let owner: Person, editor: Person, stranger: Person, projectId: string;

beforeAll(async () => {
  fake = await startFakeGithub();
  env.GITHUB_API_URL = fake.url;
  fake.control.addToken(TOKEN, { login: "owner", repos: ["acme/plans"], push: true });
  fake.control.addRepo("acme/plans");
  [owner, editor, stranger] = await Promise.all([signUp("Owner"), signUp("Editor"), signUp("Stranger")]);
  await confirmEmail(owner);
  const groupId = nanoid();
  projectId = nanoid();
  await db.insert(groups).values({ id: groupId, name: "G", keyPrefix: "RT", ownerId: owner.id, nextItemNumber: 2 });
  await db.insert(projects).values({ id: projectId, groupId, name: "Routes" });
  const listId = nanoid();
  await db.insert(lists).values({ id: listId, projectId, name: "To-do", statusRole: "TODO" });
  await db.insert(items).values({ id: nanoid(), projectId, listId, title: "First", keyNumber: 1 });
  await db.insert(members).values([{ projectId, userId: owner.id, role: "owner" }, { projectId, userId: editor.id, role: "editor" }]);
});
afterAll(() => fake.close());

const target = { token: TOKEN, owner: "acme", repo: "plans", branch: "main", path: "routes.md" };

describe("/api/projects/:id/git", () => {
  it("checks, connects, syncs, changes settings and disconnects — for the owner", async () => {
    const check = await call(`/api/projects/${projectId}/git/check`, { cookie: owner.cookie, json: target });
    expect(check.status).toBe(200);
    expect(await check.json()).toEqual({ repo: { fullName: "acme/plans", defaultBranch: "main", private: true }, fileExists: false });

    const made = await call(`/api/projects/${projectId}/git`, { cookie: owner.cookie, json: { ...target, format: "embridge", mode: "store" } });
    expect(made.status).toBe(201);
    const text = await made.text();
    expect(text).not.toContain(TOKEN);
    expect(JSON.parse(text).connection).toMatchObject({ repo: "plans", path: "routes.md", state: "ok", tokenHint: "github_pat_rout…0001", runs: [expect.objectContaining({ trigger: "connect", outcome: "pushed" })] });
    expect(fake.control.file("acme/plans", "main", "routes.md")?.text).toContain("- [ ] First");

    const synced = await call(`/api/projects/${projectId}/git/sync`, { cookie: editor.cookie, json: {} });
    expect(synced.status).toBe(200);
    expect((await synced.json()).run).toMatchObject({ outcome: "unchanged", trigger: "manual" });

    const listed = await (await call("/api/git", { cookie: editor.cookie })).json();
    expect(listed.connections.map((c: { projectName: string }) => c.projectName)).toEqual(["Routes"]);

    const policy = await call(`/api/projects/${projectId}/git`, { method: "PATCH", cookie: owner.cookie, json: { conflictPolicy: "file" } });
    expect((await policy.json()).connection.conflictPolicy).toBe("file");

    expect((await call(`/api/projects/${projectId}/git`, { method: "DELETE", cookie: owner.cookie })).status).toBe(204);
    expect((await (await call(`/api/projects/${projectId}/git`, { cookie: owner.cookie })).json()).connection).toBeNull();
  });

  it("lets members look and sync, admins connect, and nobody else in", async () => {
    expect((await call(`/api/projects/${projectId}/git`, { cookie: editor.cookie })).status).toBe(200);
    expect((await call(`/api/projects/${projectId}/git/check`, { cookie: editor.cookie, json: target })).status).toBe(403);
    expect((await call(`/api/projects/${projectId}/git`, { cookie: editor.cookie, json: { ...target, format: "embridge", mode: "store" } })).status).toBe(403);
    expect((await call(`/api/projects/${projectId}/git`, { cookie: stranger.cookie })).status).toBe(403);
    expect((await call(`/api/projects/${projectId}/git/sync`, { cookie: stranger.cookie, json: {} })).status).toBe(403);
    expect((await (await call("/api/git", { cookie: stranger.cookie })).json()).connections).toEqual([]);
  });

  it("asks for a confirmed address before connecting (R4)", async () => {
    const groupId = nanoid(), own = nanoid();
    await db.insert(groups).values({ id: groupId, name: "S", keyPrefix: "ST", ownerId: stranger.id });
    await db.insert(projects).values({ id: own, groupId, name: "Stranger's" });
    await db.insert(members).values({ projectId: own, userId: stranger.id, role: "owner" });
    const res = await call(`/api/projects/${own}/git/check`, { cookie: stranger.cookie, json: target });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/^Confirm your email address to connect a repository/);
  });

  it("checks input and explains a refused token", async () => {
    const bad = async (json: object) => (await call(`/api/projects/${projectId}/git/check`, { cookie: owner.cookie, json: { ...target, ...json } })).status;
    expect(await bad({ path: "../secrets.md" })).toBe(400);
    expect(await bad({ path: "notes.txt" })).toBe(400);
    // In the shared error shape: a sentence, the code and the field.
    const invalid = await call(`/api/projects/${projectId}/git/check`, { cookie: owner.cookie, json: { ...target, branch: "a..b" } });
    expect(await invalid.json()).toMatchObject({ code: "invalid", error: expect.any(String), fields: { branch: expect.any(String) } });
    expect(await bad({ owner: "-acme" })).toBe(400);
    expect(await bad({ branch: "a..b" })).toBe(400);
    expect((await call(`/api/projects/${projectId}/git`, { cookie: owner.cookie, json: { ...target, format: "json", mode: "store" } })).status).toBe(400);
    const refused = await call(`/api/projects/${projectId}/git/check`, { cookie: owner.cookie, json: { ...target, token: "github_pat_not_a_real_token_000" } });
    expect(refused.status).toBe(422);
    expect((await refused.json()).error).toMatch(/didn't accept the token/);
    expect((await call(`/api/projects/${projectId}/git/sync`, { cookie: owner.cookie, json: {} })).status).toBe(404);
  });
});

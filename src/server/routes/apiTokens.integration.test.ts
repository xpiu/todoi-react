// API token scopes (work plan R5): a read-only token can't change anything, a token limited to some
// projects reaches only those — not the person's other projects, groups or Inbox, and listings across
// projects narrow to them — and a token is only ever made for projects its owner is in.
import { nanoid } from "nanoid";
import { beforeAll, describe, expect, it } from "vitest";

import { call, signUp, type Person } from "../../../tests/integration/accounts";

let flo: Person, other: Person;
const groupId = nanoid(), alphaId = nanoid(), betaId = nanoid(), strangerProjectId = nanoid(), strangerGroupId = nanoid();
let alphaList = "", betaList = "";

async function project(person: Person, group: string, id: string, name: string): Promise<string> {
  const res = await call("/api/projects", { cookie: person.cookie, json: { id, groupId: group, name, lists: [["To do"]] } });
  expect(res.status).toBe(201);
  return ((await res.json()) as { lists: Array<{ id: string }> }).lists[0]!.id;
}
const item = (person: Person, listId: string | undefined, title: string) => call("/api/items", { cookie: person.cookie, json: { id: nanoid(), title, listId } });

async function token(person: Person, body: Record<string, unknown>): Promise<string> {
  const res = await call("/api/me/tokens", { cookie: person.cookie, json: { name: "Agent", ...body } });
  expect(res.status).toBe(201);
  return ((await res.json()) as { secret: string }).secret;
}
const as = (secret: string, path: string, init: { method?: string; json?: unknown } = {}) => call(path, { ...init, headers: { authorization: `Bearer ${secret}` } });

beforeAll(async () => {
  [flo, other] = await Promise.all([signUp("Flo"), signUp("Other")]);
  expect((await call("/api/groups", { cookie: flo.cookie, json: { id: groupId, name: "Work", keyPrefix: "WRK" } })).status).toBe(201);
  alphaList = await project(flo, groupId, alphaId, "Alpha");
  betaList = await project(flo, groupId, betaId, "Beta");
  expect((await call("/api/groups", { cookie: other.cookie, json: { id: strangerGroupId, name: "Theirs", keyPrefix: "THR" } })).status).toBe(201);
  await project(other, strangerGroupId, strangerProjectId, "Not Flo's");
  for (const [list, title] of [[alphaList, "Alpha launch plan"], [betaList, "Beta launch plan"], [undefined, "Inbox launch idea"]] as const) expect((await item(flo, list, title)).status).toBe(201);
});

describe("API token scopes", () => {
  it("are read only unless asked for, and say what they are", async () => {
    const res = await call("/api/me/tokens", { cookie: flo.cookie, json: { name: "Reader" } });
    expect(await res.json()).toMatchObject({ access: "read", projectIds: null });
    const list = (await (await call("/api/me/tokens", { cookie: flo.cookie })).json()) as Array<{ name: string; access: string }>;
    expect(list.find((t) => t.name === "Reader")).toMatchObject({ access: "read" });
  });

  it("refuse every change from a read-only token, and allow reads", async () => {
    const secret = await token(flo, { access: "read" });
    expect((await as(secret, `/api/v1/items?listId=${alphaList}`)).status).toBe(200);
    const write = await as(secret, "/api/v1/items", { json: { id: nanoid(), title: "Sneaky", listId: alphaList } });
    expect(write.status).toBe(403);
    expect((await write.json()).error).toMatch(/can only read/);
  });

  it("let a read-and-write token change things where its owner can", async () => {
    const secret = await token(flo, { access: "write" });
    expect((await as(secret, "/api/v1/items", { json: { id: nanoid(), title: "From the agent", listId: alphaList } })).status).toBe(201);
    expect((await as(secret, "/api/v1/items", { json: { id: nanoid(), title: "Into the Inbox" } })).status).toBe(201);
  });

  it("keep a token limited to some projects inside them", async () => {
    const secret = await token(flo, { access: "write", projectIds: [alphaId] });
    expect((await as(secret, `/api/v1/projects/${alphaId}`)).status).toBe(200);
    expect((await as(secret, "/api/v1/items", { json: { id: nanoid(), title: "Inside", listId: alphaList } })).status).toBe(201);
    // Flo's other project, Flo's Inbox and Flo's groups are out of its reach.
    const beta = await as(secret, `/api/v1/projects/${betaId}`);
    expect(beta.status).toBe(403);
    expect((await beta.json()).error).toMatch(/This API token can't reach this project/);
    expect((await as(secret, `/api/v1/items?listId=${betaList}`)).status).toBe(403);
    expect((await as(secret, "/api/v1/items")).status).toBe(403);
    expect((await as(secret, "/api/v1/items", { json: { id: nanoid(), title: "Into the Inbox" } })).status).toBe(403);
    const exported = await as(secret, "/api/v1/me/export");
    expect(exported.status).toBe(403);
    expect((await exported.json()).error).toMatch(/can't reach the whole account/);
  });

  it("narrow listings across projects to a limited token's projects", async () => {
    const secret = await token(flo, { projectIds: [alphaId] });
    const groups = (await (await as(secret, "/api/v1/groups")).json()) as Array<{ id: string; projects: Array<{ id: string }> }>;
    expect(groups.flatMap((g) => g.projects.map((p) => p.id))).toEqual([alphaId]);
    const hits = (await (await as(secret, "/api/v1/search?q=launch")).json()) as Array<{ title: string }>;
    expect(hits.map((h) => h.title)).toEqual(["Alpha launch plan"]);
    const full = (await (await as(secret, "/api/v1/search/full?q=launch")).json()) as { hits: Array<{ title: string }> };
    expect(full.hits.map((h) => h.title)).toEqual(["Alpha launch plan"]);
    // A token for every project still sees them all, and the Inbox.
    const all = (await (await as(await token(flo, {}), "/api/v1/search?q=launch")).json()) as Array<{ title: string }>;
    expect(all.map((h) => h.title).sort()).toEqual(["Alpha launch plan", "Beta launch plan", "Inbox launch idea"]);
  });

  it("are only made for projects their owner is in", async () => {
    const res = await call("/api/me/tokens", { cookie: flo.cookie, json: { name: "Greedy", projectIds: [alphaId, strangerProjectId] } });
    expect(res.status).toBe(400);
    expect((await res.json()).fields).toMatchObject({ projectIds: expect.any(String) });
    expect((await call("/api/me/tokens", { cookie: flo.cookie, json: { name: "Empty", projectIds: [] } })).status).toBe(400);
  });
});

describe("API v1", () => {
  it("is where tokens work: the unversioned API refuses them", async () => {
    const secret = await token(flo, {});
    const refused = await as(secret, "/api/groups");
    expect(refused.status).toBe(401);
    expect((await refused.json()).error).toMatch(/API tokens work on \/api\/v1/);
    expect((await as(secret, "/api/v1/groups")).status).toBe(200);
  });

  it("answers only its listed operations, so a token can't reach account management", async () => {
    const secret = await token(flo, { access: "write" });
    for (const [method, path] of [["POST", "/api/v1/me/tokens"], ["GET", "/api/v1/me/tokens"], ["POST", "/api/v1/me/deletion"], ["GET", "/api/v1/inbox/unread"], ["PATCH", `/api/v1/groups/${groupId}`], ["POST", "/api/v1/auth/sign-out"], ["GET", "/api/v1/nowhere"]] as const) {
      const res = await as(secret, path, { method, json: method === "GET" ? undefined : {} });
      expect(res.status, `${method} ${path}`).toBe(404);
    }
    const res = await as(secret, "/api/v1/me/tokens", { json: { name: "Escalate", access: "write" } });
    expect((await res.json()).error).toMatch(/isn't part of Todoi's API v1/);
  });

  it("serves the same routes to a signed-in browser", async () => {
    expect((await call(`/api/v1/projects/${alphaId}`, { cookie: flo.cookie })).status).toBe(200);
    expect((await call("/api/v1/me/tokens", { cookie: flo.cookie })).status).toBe(404);
  });
});

// "Continue with GitHub" against the fake GitHub: the round trip (authorize, install, an owner's approval
// pending, a cancelled or forged return), what a linked person can pick and connect — and can't, whatever
// installation id a URL carries —, syncing on installation tokens, a renamed repository, access taken away
// on GitHub, an expiring token renewed, and the app's own webhook.
import { createHmac, generateKeyPairSync } from "node:crypto";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { call, confirmEmail, cookiesFrom, signUp, type Person } from "../../../tests/integration/accounts";
import { startFakeGithub } from "../../../tests/fakes/fakeGithub";
import { db } from "../db";
import { gitConnections, githubAccounts, groups, items, lists, members, projects } from "../db/schema";
import { env } from "../env";
import { syncConnection } from "./engine";
import { handleWebhook } from "./webhooks";

let fake: Awaited<ReturnType<typeof startFakeGithub>>;
let flo: Person, eve: Person;
/** Flo on GitHub: installation 7 gives two repositories */
const floOnGitHub = { login: "flo", installations: { 7: ["acme/plans", "acme/notes"] } as Record<number, string[]> };
const WEBHOOK_SECRET = "app-webhook-secret-for-tests";

async function project(owner: Person, name: string) {
  const groupId = nanoid(), projectId = nanoid(), listId = nanoid();
  await db.insert(groups).values({ id: groupId, name: "G", keyPrefix: nanoid(4).replace(/[^A-Za-z]/g, "X").toUpperCase(), ownerId: owner.id, nextItemNumber: 2 });
  await db.insert(projects).values({ id: projectId, groupId, name });
  await db.insert(lists).values({ id: listId, projectId, name: "To-do", statusRole: "TODO" });
  await db.insert(items).values({ id: nanoid(), projectId, listId, title: "First", keyNumber: 1 });
  await db.insert(members).values({ projectId, userId: owner.id, role: "owner" });
  return projectId;
}

beforeAll(async () => {
  fake = await startFakeGithub();
  Object.assign(env, {
    GITHUB_API_URL: fake.url,
    GITHUB_URL: fake.url,
    GITHUB_APP_ID: "12345",
    GITHUB_APP_SLUG: "todoi-test",
    GITHUB_APP_CLIENT_ID: "Iv1.test",
    GITHUB_APP_CLIENT_SECRET: "client-secret",
    // As a host often stores it: one line, "\n" for the line breaks.
    GITHUB_APP_PRIVATE_KEY: generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs1", format: "pem" }).toString().replace(/\n/g, "\\n"),
    GITHUB_APP_WEBHOOK_SECRET: WEBHOOK_SECRET,
  });
  for (const r of ["acme/plans", "acme/notes", "victim/secret"]) fake.control.addRepo(r);
  [flo, eve] = await Promise.all([signUp("Flo"), signUp("Eve")]);
  await Promise.all([confirmEmail(flo), confirmEmail(eve)]);
});
afterAll(() => fake.close());

const location = (res: Response) => res.headers.get("location") ?? "";
/** The path and query of a URL GitHub sent the browser back to. */
const pathOf = (url: string) => `${new URL(url).pathname}${new URL(url).search}`;
/** Follow one page of the fake GitHub, as the browser would. */
const visit = async (url: string) => location(await fetch(url, { redirect: "manual" }));

/** Leave for GitHub and come back, following every redirect; returns where the person lands and their cookies. */
async function roundTrip(person: Person, next = "/settings?s=storage") {
  const start = await call(`/api/git/github/start?next=${encodeURIComponent(next)}`, { cookie: person.cookie });
  expect(start.status).toBe(302);
  let cookie = cookiesFrom(start, person.cookie), at = location(start);
  const seen: string[] = [];
  while (at.startsWith(fake.url)) {
    seen.push(new URL(at).pathname);
    const back = await call(pathOf(await visit(at)), { cookie });
    cookie = cookiesFrom(back, cookie);
    at = location(back);
  }
  return { landed: at, seen, cookie };
}
const link = async (person: Person) => (await (await call("/api/git/github", { cookie: person.cookie })).json()) as { app: boolean; login: string | null; repos: Array<{ fullName: string; canPush: boolean }>; manageUrl: string | null };

describe("Continue with GitHub", () => {
  it("authorizes, finds the app already installed, and lists what can be picked", async () => {
    expect(await link(flo)).toMatchObject({ app: true, login: null, repos: [] });
    fake.control.appUser(floOnGitHub);
    const trip = await roundTrip(flo, "/settings?s=storage&connect=p1");
    expect(trip.seen).toEqual(["/login/oauth/authorize"]);
    expect(trip.landed).toBe("/settings?s=storage&connect=p1&github=linked");
    // The trip's cookie is gone once it ends.
    expect(trip.cookie).not.toContain("td_github");
    expect(await link(flo)).toMatchObject({ login: "flo", repos: [{ fullName: "acme/notes", canPush: true }, { fullName: "acme/plans", canPush: true }], manageUrl: `${fake.url}/apps/todoi-test/installations/new` });
    expect((await (await call("/api/git", { cookie: flo.cookie })).json()).github).toEqual({ app: true, login: "flo" });
    // The token is stored sealed.
    const [account] = await db.select().from(githubAccounts).where(eq(githubAccounts.userId, flo.id));
    expect(account!.tokenCipher).toMatch(/^v1\./);
  });

  it("goes on to install the app when it is installed nowhere, once", async () => {
    fake.control.appUser({ login: "eve", installations: {}, onInstall: { 9: ["acme/notes"] } });
    const trip = await roundTrip(eve);
    expect(trip.seen).toEqual(["/login/oauth/authorize", "/apps/todoi-test/installations/new"]);
    expect(trip.landed).toBe("/settings?s=storage&github=linked");
    expect((await link(eve)).repos.map((r) => r.fullName)).toEqual(["acme/notes"]);
  });

  it("says when an organization's owner has to approve, and when nothing was chosen", async () => {
    const asker = await signUp("Asker");
    fake.control.appUser({ login: "asker", installations: {}, install: "request" });
    expect((await roundTrip(asker)).landed).toBe("/settings?s=storage&github=requested");
    fake.control.appUser({ login: "asker", installations: {} });
    expect((await roundTrip(asker)).landed).toBe("/settings?s=storage&github=none");
  });

  it("refuses a return it didn't start, a cancelled one, and a guest", async () => {
    const mallory = await signUp("Mallory");
    const victim = fake.control.appUser({ login: "victim", installations: { 3: ["victim/secret"] } })!;
    // A code without the trip's state (someone else's link, pasted): nothing is linked.
    const forged = await call(`/api/git/github/callback?code=${fake.control.codeFor(victim)}&state=made-up&installation_id=3&setup_action=install`, { cookie: mallory.cookie });
    expect(location(forged)).toBe("/settings?s=storage&github=expired");
    expect((await link(mallory)).login).toBeNull();
    // The right cookie with another state is no better.
    const start = await call("/api/git/github/start", { cookie: mallory.cookie });
    const wrong = await call(`/api/git/github/callback?code=${fake.control.codeFor(victim)}&state=made-up`, { cookie: cookiesFrom(start, mallory.cookie) });
    expect(location(wrong)).toBe("/settings?s=storage&github=expired");
    // Cancelled on GitHub.
    fake.control.appUser(null);
    expect((await roundTrip(mallory)).landed).toBe("/settings?s=storage&github=denied");
    // Started on GitHub's side, or not signed in: straight to Settings, nothing read from the URL.
    expect(location(await call("/api/git/github/callback?installation_id=3&setup_action=install", { cookie: mallory.cookie }))).toBe("/settings?s=storage");
    expect(location(await call("/api/git/github/start?next=/account"))).toBe("/login?next=%2Faccount");
    // Only paths inside the app are returned to.
    fake.control.appUser({ login: "mallory", installations: { 4: [] } });
    expect((await roundTrip(mallory, "//evil.example/x")).landed).toBe("/settings?s=storage&github=linked");
  });

  it("connects what the person can reach — and nothing an installation id could name", async () => {
    const projectId = await project(flo, "Via app");
    const target = { owner: "acme", repo: "plans", branch: "main", path: "todo/app.md" };
    const check = await call(`/api/projects/${projectId}/git/check`, { cookie: flo.cookie, json: target });
    expect(await check.json()).toEqual({ repo: { fullName: "acme/plans", defaultBranch: "main", private: true }, fileExists: false });
    // The app is installed on victim/secret (installation 3), but flo can't reach it on GitHub.
    const stolen = await call(`/api/projects/${projectId}/git/check`, { cookie: flo.cookie, json: { ...target, owner: "victim", repo: "secret" } });
    expect(stolen.status).toBe(422);
    expect((await stolen.json()).error).toMatch(/todoi's GitHub app can't reach victim\/secret/);
    // Someone who never continued with GitHub is told so.
    const unlinked = await signUp("Unlinked");
    await confirmEmail(unlinked);
    const theirs = await project(unlinked, "Theirs");
    expect((await (await call(`/api/projects/${theirs}/git/check`, { cookie: unlinked.cookie, json: target })).json()).error).toMatch(/Continue with GitHub again/);

    const made = await call(`/api/projects/${projectId}/git`, { cookie: flo.cookie, json: { ...target, format: "embridge", mode: "store" } });
    expect(made.status).toBe(201);
    expect((await made.json()).connection).toMatchObject({ via: "app", tokenHint: "", state: "ok", webhook: true });
    const [c] = await db.select().from(gitConnections).where(eq(gitConnections.projectId, projectId));
    expect(c).toMatchObject({ installationId: 7, tokenCipher: null, hookId: null, repoId: fake.control.repo("acme/plans")!.id });
    expect(fake.control.file("acme/plans", "main", "todo/app.md")?.text).toContain("- [ ] First");

    // A push on GitHub syncs with a token minted from the installation.
    await fake.control.push("acme/plans", "main", "todo/app.md", fake.control.file("acme/plans", "main", "todo/app.md")!.text.replace("- [ ] First", "- [x] First"));
    expect(await syncConnection(c!.id, "manual", flo.id)).toMatchObject({ outcome: "pulled", pulled: 1 });
  });

  it("follows a renamed repository, and says when the app lost access", async () => {
    const [c] = await db.select().from(gitConnections).where(eq(gitConnections.owner, "acme"));
    fake.control.rename("acme/plans", "acme/roadmap");
    expect(await syncConnection(c!.id, "manual", flo.id)).toMatchObject({ outcome: "unchanged" });
    expect((await db.select().from(gitConnections).where(eq(gitConnections.id, c!.id)))[0]).toMatchObject({ owner: "acme", repo: "roadmap", state: "ok" });

    // The app's own webhook: a push to the file, signed with the app's secret, queues the sync.
    const queued: string[] = [];
    const deliver = (event: string, payload: object, secret = WEBHOOK_SECRET) => {
      const body = JSON.stringify(payload);
      return handleWebhook({ event, delivery: nanoid(), signature: `sha256=${createHmac("sha256", secret).update(body).digest("hex")}` }, body, async (id) => void queued.push(id));
    };
    const push = { ref: "refs/heads/main", after: "f".repeat(40), installation: { id: 7 }, repository: { id: c!.repoId, full_name: "acme/roadmap" }, commits: [{ id: "f".repeat(40), modified: ["todo/app.md"] }] };
    expect(await deliver("push", push)).toEqual({ status: 202, synced: [c!.id] });
    expect(await deliver("push", push, "someone-else")).toEqual({ status: 401 });
    expect(await deliver("installation_repositories", { action: "removed", installation: { id: 7 } })).toEqual({ status: 202, synced: [c!.id] });
    expect(await deliver("ping", { zen: "Keep it logically awesome." })).toEqual({ status: 200, synced: [] });
    // Unsigned junk never reaches the database as anything but text or a whole number: a refusal, not a fault.
    for (const body of ["null", "[]", '"x"', JSON.stringify({ repository: { id: "1; drop table users", full_name: "acme/roadmap" } }), JSON.stringify({ repository: { id: 1e40, full_name: { a: 1 } }, installation: { id: "7" } })])
      expect((await handleWebhook({ event: "push", delivery: nanoid(), signature: "sha256=00" }, body, async (id) => void queued.push(id))).status).toBeGreaterThanOrEqual(400);
    expect(queued).toEqual([c!.id, c!.id]);

    // The repository is taken out of the installation on GitHub.
    floOnGitHub.installations[7] = ["acme/notes"];
    const run = await syncConnection(c!.id, "manual", flo.id);
    expect(run).toMatchObject({ outcome: "failed" });
    expect(run.error).toMatch(/todoi's GitHub app can't reach acme\/roadmap \(main\) anymore/);
  });

  it("renews a token that expires, and ends the link when GitHub won't", async () => {
    const person = await signUp("Expiring");
    fake.control.expireTokens(true);
    fake.control.appUser({ login: "expiring", installations: { 11: ["acme/notes"] } });
    await roundTrip(person);
    fake.control.expireTokens(false);
    const before = (await db.select().from(githubAccounts).where(eq(githubAccounts.userId, person.id)))[0]!;
    expect(before.refreshCipher).toMatch(/^v1\./);
    await db.update(githubAccounts).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(githubAccounts.userId, person.id));
    // Two requests at once renew once: a refresh token works a single time.
    const [a, b] = await Promise.all([link(person), link(person)]);
    expect([a.login, b.login]).toEqual(["expiring", "expiring"]);
    const after = (await db.select().from(githubAccounts).where(eq(githubAccounts.userId, person.id)))[0]!;
    expect(after.tokenCipher).not.toBe(before.tokenCipher);
    // No refresh token came back this time: the old one is kept, GitHub refuses it next time, and the link ends.
    expect(after.refreshCipher).toBe(before.refreshCipher);
    await db.update(githubAccounts).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(githubAccounts.userId, person.id));
    expect((await link(person)).login).toBeNull();
    expect(await db.select().from(githubAccounts).where(eq(githubAccounts.userId, person.id))).toEqual([]);
  });
});

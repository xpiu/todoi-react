// Git sync end to end against a fake GitHub (tests/fakes/fakeGithub.ts) and a real database: connecting
// (store a new file / use an existing one), syncing both ways, conflicts and their policies, a push that
// lands mid-sync, undo, and the failures a person has to be told about.
import { and, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { fromEmbridge } from "../../shared/projectDoc/embridge";
import { startFakeGithub } from "../../../tests/fakes/fakeGithub";
import { db } from "../db";
import { comments, gitConnections, gitSyncRuns, groups, itemLabels, items, labels, lists, members, projects, users } from "../db/schema";
import { env } from "../env";
import { updateItem } from "../services/items";
import { connectProject, disconnectProject, pruneSyncRuns, syncConnection, SyncFailure, undoLastSync } from "./engine";

const REPO = "acme/plans";
let fake: Awaited<ReturnType<typeof startFakeGithub>>;
beforeAll(async () => {
  fake = await startFakeGithub();
  env.GITHUB_API_URL = fake.url;
});
afterAll(() => fake.close());
beforeEach(() => {
  fake.control.reset();
  fake.control.addToken("github_pat_test_write_0001", { login: "flo", repos: [REPO], push: true });
  fake.control.addToken("github_pat_test_read_0002", { login: "flo", repos: [REPO], push: false });
  fake.control.addRepo(REPO, { branches: ["dev"] });
});

async function fixture() {
  const userId = nanoid(), groupId = nanoid(), projectId = nanoid(), todo = nanoid(), done = nanoid();
  await db.insert(users).values({ id: userId, name: "Flo Zimmer", nickname: "flo", email: `${userId}@example.test` });
  await db.insert(groups).values({ id: groupId, name: "Test", keyPrefix: "GS", ownerId: userId, nextItemNumber: 4 });
  await db.insert(projects).values({ id: projectId, groupId, name: "Website" });
  await db.insert(lists).values([
    { id: todo, projectId, name: "To-do", statusRole: "TODO", position: 0 },
    { id: done, projectId, name: "Done", statusRole: "DONE", position: 1 },
  ]);
  await db.insert(members).values({ projectId, userId, role: "owner" });
  const write = nanoid(), outline = nanoid(), review = nanoid();
  await db.insert(items).values([
    { id: write, projectId, listId: todo, title: "Write the post", status: "TODO", position: 0, keyNumber: 1 },
    { id: outline, projectId, listId: todo, parentItemId: write, title: "Outline", status: "TODO", position: 0, keyNumber: 2 },
    { id: review, projectId, listId: todo, title: "Review", status: "TODO", priority: "HIGH", dueDate: "2026-12-01", position: 1, keyNumber: 3 },
  ]);
  return { userId, projectId, todo, done, write, outline, review };
}
const connect = (f: Awaited<ReturnType<typeof fixture>>, over: Partial<Parameters<typeof connectProject>[0]> = {}) =>
  connectProject({ projectId: f.projectId, access: { token: "github_pat_test_write_0001" }, owner: "acme", repo: "plans", branch: "main", path: "todo/website.md", format: "embridge", mode: "store", ...over }, f.userId);
const file = (path = "todo/website.md", branch = "main") => fake.control.file(REPO, branch, path)?.text ?? null;
const row = async (id: string) => (await db.select().from(items).where(eq(items.id, id)))[0]!;

describe("connecting", () => {
  it("stores the project as a new file, with ids, without bumping row versions", async () => {
    const f = await fixture();
    const before = await row(f.review);
    const { connection, run } = await connect(f);
    expect(run).toMatchObject({ trigger: "connect", outcome: "pushed", pushed: 3 });
    expect(connection).toMatchObject({ state: "ok", tokenHint: "github_pat_test…0001" });
    expect(connection.tokenCipher).not.toContain("github_pat_test_write_0001");
    const md = file()!;
    const doc = fromEmbridge(md).doc;
    expect(doc.title).toBe("Website");
    expect(doc.lists.map((l) => [l.name, l.items.map((i) => i.title)])).toEqual([["To-do", ["Write the post", "Review"]], ["Done", []]]);
    expect(doc.lists[0]!.items[1]).toMatchObject({ priority: "HIGH", due: "2026-12-01", status: "TODO" });
    const after = await row(f.review);
    expect(after.externalId).toBe(doc.lists[0]!.items[1]!.id);
    expect(after.version).toBe(before.version);
  });

  it("refuses a token that can't write, a missing branch, and an existing file in store mode", async () => {
    const f = await fixture();
    await expect(connect(f, { access: { token: "nope" } })).rejects.toThrow(/didn't accept the token/);
    await expect(connect(f, { access: { token: "github_pat_test_read_0002" } })).rejects.toThrow(/can read acme\/plans but not write/);
    await expect(connect(f, { branch: "gone" })).rejects.toThrow(/no branch named gone/);
    await fake.control.push(REPO, "main", "todo/website.md", "- [ ] Already here\n");
    await expect(connect(f)).rejects.toThrow(SyncFailure);
    await expect(connect(f)).rejects.toThrow(/already exists/);
  });

  it("uses an existing JSON file as the project, and undo brings the old content back", async () => {
    const f = await fixture();
    await fake.control.push(REPO, "dev", "plans.json", JSON.stringify({ format: "todoi.project", version: 1, lists: [{ name: "Backlog", items: [{ title: "From the repo", labels: ["web"], comments: [{ author: "sam", text: "Spec is in docs/" }] }] }] }));
    const { run } = await connect(f, { mode: "use", format: "json", branch: "dev", path: "plans.json" });
    expect(run).toMatchObject({ outcome: "pulled" });
    const live = await db.select().from(items).where(and(eq(items.projectId, f.projectId)));
    // Top-level items: a subitem goes to the Trash with its parent.
    expect(live.filter((i) => !i.deletedAt && !i.parentItemId).map((i) => i.title)).toEqual(["From the repo"]);
    expect(live.filter((i) => i.deletedAt).map((i) => i.title).sort()).toEqual(["Review", "Write the post"]);
    const repoItem = live.find((i) => i.title === "From the repo")!;
    expect((await db.select().from(comments).where(eq(comments.itemId, repoItem.id)))[0]).toMatchObject({ body: "**sam**\n\nSpec is in docs/", fileOrigin: { author: "sam", text: "Spec is in docs/" } });
    expect((await db.select({ name: labels.name }).from(itemLabels).innerJoin(labels, eq(labels.id, itemLabels.labelId)).where(eq(itemLabels.itemId, repoItem.id)))[0]?.name).toBe("web");
    // The file got its ids written back, in todoi's canonical form.
    const written = JSON.parse(file("plans.json", "dev")!);
    expect(written.lists[0].items[0].id).toBe(repoItem.externalId);
    expect(written.title).toBe("Website");

    const [c] = await db.select().from(gitConnections).where(eq(gitConnections.projectId, f.projectId));
    const undo = await undoLastSync(c!.id, f.userId);
    expect(undo).toMatchObject({ outcome: "undone", trigger: "undo" });
    const restored = await db.select().from(items).where(eq(items.projectId, f.projectId));
    expect(restored.filter((i) => !i.deletedAt && !i.parentItemId).map((i) => i.title).sort()).toEqual(["Review", "Write the post"]);
    expect(JSON.parse(file("plans.json", "dev")!).lists.flatMap((l: { items?: Array<{ title: string }> }) => (l.items ?? []).map((i) => i.title)).sort()).toEqual(["Review", "Write the post"]);
  });
});

describe("syncing", () => {
  it("writes todoi's edits to the file, and the file's edits to todoi", async () => {
    const f = await fixture();
    const { connection } = await connect(f);
    await updateItem(f.review, { done: true }, {}, {}, f.userId);
    const out = await syncConnection(connection.id, "manual", f.userId);
    expect(out).toMatchObject({ outcome: "pushed", pushed: 1, pulled: 0 });
    expect(file()).toMatch(/- \[x\] Review\nprio: high, due: 2026-12-01, id: \w+/);

    const md = file()!.replace("- [ ] Write the post", "- [ ] Write the launch post").replace("# Done\n", "# Done\n- [x] Book the venue\n> @sam [2026-11-20]: Booked\n");
    await fake.control.push(REPO, "main", "todo/website.md", md);
    const back = await syncConnection(connection.id, "manual", f.userId);
    // Writing the new item's id back is tidying, not a change: the run reads "pulled".
    expect(back).toMatchObject({ outcome: "pulled", pulled: 2, pushed: 0 });
    expect(back.commitSha).not.toBeNull();
    expect((await row(f.write)).title).toBe("Write the launch post");
    const venue = (await db.select().from(items).where(and(eq(items.projectId, f.projectId), eq(items.title, "Book the venue"))))[0]!;
    expect(venue).toMatchObject({ done: true, status: "DONE", listId: f.done });
    expect((await db.select().from(comments).where(eq(comments.itemId, venue.id)))[0]?.body).toBe("**sam** · 2026-11-20\n\nBooked");
    // The new item got an id in the file; the comment reads back exactly as written.
    expect(file()).toContain(`- [x] Book the venue\nid: ${venue.externalId}\n> @sam [2026-11-20]: Booked`);
    expect(await syncConnection(connection.id, "manual", f.userId)).toMatchObject({ outcome: "unchanged", pulled: 0, pushed: 0 });
  });

  it("pauses on a conflict, then applies the side picked per conflict", async () => {
    const f = await fixture();
    const { connection } = await connect(f);
    await updateItem(f.review, {}, { title: "Review (todoi)" }, {}, f.userId);
    await fake.control.push(REPO, "main", "todo/website.md", file()!.replace("Review", "Review (file)").replace("- [ ] Write the post", "- [x] Write the post"));
    const paused = await syncConnection(connection.id, "manual", f.userId);
    expect(paused).toMatchObject({ outcome: "conflict", conflicts: 1 });
    const [c] = await db.select().from(gitConnections).where(eq(gitConnections.id, connection.id));
    expect(c).toMatchObject({ state: "conflict" });
    expect(c!.pending!.conflicts).toEqual([expect.objectContaining({ kind: "field", field: "title", ours: "Review (todoi)", theirs: "Review (file)" })]);
    // Nothing applied while paused.
    expect((await row(f.write)).done).toBe(false);

    const resolved = await syncConnection(connection.id, "resolve", f.userId, { choices: { [c!.pending!.conflicts[0]!.key]: "theirs" } });
    // Picking the file's side leaves nothing to write back.
    expect(resolved.outcome).toBe("pulled");
    expect((await row(f.review)).title).toBe("Review (file)");
    expect((await row(f.write)).done).toBe(true);
    expect((await db.select().from(gitConnections).where(eq(gitConnections.id, connection.id)))[0]).toMatchObject({ state: "ok", pending: null });
  });

  it("decides conflicts by policy when told to", async () => {
    const f = await fixture();
    const { connection } = await connect(f, { conflictPolicy: "file" });
    await updateItem(f.review, {}, { title: "todoi" }, {}, f.userId);
    await fake.control.push(REPO, "main", "todo/website.md", file()!.replace("Review", "File"));
    expect(await syncConnection(connection.id, "manual", f.userId)).toMatchObject({ outcome: "pulled", conflicts: 1 });
    expect((await row(f.review)).title).toBe("File");
  });

  it("starts over when someone pushes while it writes", async () => {
    const f = await fixture();
    const { connection } = await connect(f);
    await updateItem(f.review, {}, { priority: "LOW" }, {}, f.userId);
    fake.control.beforeNextWrite(() => fake.control.push(REPO, "main", "todo/website.md", file()!.replace("- [ ] Write the post", "- [ ] Write it")));
    const run = await syncConnection(connection.id, "manual", f.userId);
    expect(run.outcome).toBe("merged");
    expect((await row(f.write)).title).toBe("Write it");
    expect(file()).toContain("- [ ] Write it");
    expect(file()).toMatch(/Review\nstatus: todo, prio: low/);
  });

  it("keeps file-only values: custom fields, unknown assignees, attachment links, deeper nesting flattened with a note", async () => {
    const f = await fixture();
    const { connection } = await connect(f);
    const md = file()!.replace(/(- \[ \] Review\nstatus: todo, prio: high, due: 2026-12-01, id: \w+)/, "$1, ref: A-7, assignee: \"@flo, @ghost\"\n  - [Spec](docs/spec.pdf)\n  - [ ] Check copy\n    - [ ] Check headings");
    await fake.control.push(REPO, "main", "todo/website.md", md);
    const run = await syncConnection(connection.id, "manual", f.userId);
    expect(run.notes).toEqual(["“Check headings” was a subitem of a subitem, so it's now a direct subitem of “Review”. todoi has two levels: items and subitems"]);
    expect((await row(f.review)).syncExtra).toEqual({ fields: { ref: "A-7" }, assignees: ["ghost"], attachments: [{ label: "Spec", url: "docs/spec.pdf", image: false }] });
    const after = file()!;
    expect(after).toMatch(/assignee: "@flo, @ghost"/);
    expect(after).toContain("ref: A-7");
    expect(after).toContain("  - [Spec](docs/spec.pdf)");
    expect(after).toMatch(/ {2}- \[ \] Check headings/);
    expect(await syncConnection(connection.id, "manual", f.userId)).toMatchObject({ outcome: "unchanged" });
  });

  it("records a failure the person can act on, and recovers", async () => {
    const f = await fixture();
    const { connection } = await connect(f);
    await fake.control.push(REPO, "main", "todo/website.md", null);
    const gone = await syncConnection(connection.id, "manual", f.userId);
    expect(gone).toMatchObject({ outcome: "failed", error: "todo/website.md is gone from acme/plans (main). Store a new file there, or disconnect" });
    expect((await db.select().from(gitConnections).where(eq(gitConnections.id, connection.id)))[0]).toMatchObject({ state: "error" });
    fake.control.addToken("github_pat_test_write_0001", { login: "flo", repos: [], push: true });
    expect((await syncConnection(connection.id, "manual", f.userId)).error).toMatch(/can't find acme\/plans/);
    await disconnectProject(f.projectId);
    expect(await db.select().from(gitConnections).where(eq(gitConnections.projectId, f.projectId))).toEqual([]);
    expect(await db.select().from(gitSyncRuns).where(inArray(gitSyncRuns.connectionId, [connection.id]))).toEqual([]);
  });

  it("keeps scheduled syncs quiet: nothing new, or the same failure again, adds no line", async () => {
    const f = await fixture();
    const { connection } = await connect(f);
    const runs = async () => db.select().from(gitSyncRuns).where(eq(gitSyncRuns.connectionId, connection.id));
    const before = (await runs()).length;
    expect((await syncConnection(connection.id, "auto", null)).outcome).toBe("unchanged");
    expect((await runs()).length).toBe(before);
    await fake.control.push(REPO, "main", "todo/website.md", null);
    expect((await syncConnection(connection.id, "auto", null)).outcome).toBe("failed");
    expect((await syncConnection(connection.id, "auto", null)).outcome).toBe("failed");
    expect((await runs()).length).toBe(before + 1);
  });

  it("prunes old sync history but keeps each connection's latest runs", async () => {
    const f = await fixture();
    const { connection } = await connect(f);
    const old = new Date(Date.now() - 200 * 86_400_000);
    await db.insert(gitSyncRuns).values(Array.from({ length: 30 }, (_, i) => ({ id: nanoid(), connectionId: connection.id, trigger: "manual" as const, outcome: "unchanged" as const, createdAt: new Date(old.getTime() + i * 1000) })));
    expect(await pruneSyncRuns()).toBe(11);
    expect(await db.select().from(gitSyncRuns).where(eq(gitSyncRuns.connectionId, connection.id))).toHaveLength(20);
  });

  it("round-trips YAML the same way", async () => {
    const f = await fixture();
    const { connection } = await connect(f, { format: "yaml", path: "website.yaml" });
    expect(file("website.yaml")).toContain('title: "Write the post"');
    await fake.control.push(REPO, "main", "website.yaml", file("website.yaml")!.replace('title: "Review"', 'title: "Review it"\n        labels:\n          - "qa"'));
    expect(await syncConnection(connection.id, "manual", f.userId)).toMatchObject({ outcome: "pulled", pulled: 1 });
    expect((await row(f.review)).title).toBe("Review it");
  });
});

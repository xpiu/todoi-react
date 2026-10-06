import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { describe, expect, it, vi } from "vitest";

import type { Viewer } from "./auth";
import { db } from "./db";
import { activity, attachments, comments, groups, itemRelations, itemWatchers, items, labels, lists, members, operationReceipts, projects, users } from "./db/schema";
import { commentsRoute, itemContentRoute, labelsRoute } from "./routes/content";
import { itemsRoute } from "./routes/items";
import { attachmentsRoute } from "./routes/attachments";
import { archiveRoute } from "./routes/projects";
import { destroyItem } from "./services/lifecycle";
import { readUpload, saveUpload } from "./services/uploads";
import { onError, fail } from "./errors";
import { workspaceMutations } from "./sync";

vi.mock("./auth", () => ({
  inboxFor: (id: string) => { if (notificationFailure.userId === id) throw new Error("Intentional notification delivery failure"); return Promise.resolve(viewers.get(id)!.inboxListId); },
  viewerOf: (c: { get: (name: string) => unknown }) => c.get("viewer"),
  maybeViewer: (c: { get: (name: string) => unknown }) => c.get("viewer"),
}));
const notificationFailure = vi.hoisted(() => ({ userId: "" }));
const viewers = new Map<string, { userId: string; inboxListId: string; name: string; email: string; isAnonymous: boolean }>();
const app = new Hono<{ Variables: { viewer: Viewer | undefined } }>()
  .use("*", async (c, next) => { c.set("viewer", viewers.get(c.req.header("X-Test-Actor")!)); await next(); })
  .use("*", workspaceMutations)
  .route("/api/items", itemsRoute)
  .route("/api/items", itemContentRoute)
  .route("/api/comments", commentsRoute)
  .route("/api/labels", labelsRoute)
  .route("/api/attachments", attachmentsRoute)
  .route("/api/archive", archiveRoute)
  .post("/api/items/:id/refuse-after-delete", async (c) => {
    await destroyItem(c.req.param("id"));
    return fail(c, 400, "Refused after delete");
  })
  .post("/api/items/:id/refuse-after-writes", async (c) => {
    await db.transaction(async (tx) => {
      await tx.update(items).set({ title: "Must roll back" }).where(eq(items.id, c.req.param("id")));
      // Calls through db inside a nested transaction must use that same savepoint, too.
      await db.insert(comments).values({ id: nanoid(), itemId: c.req.param("id"), authorId: c.req.header("X-Test-Actor")!, body: "Must roll back" });
    });
    return fail(c, 400, "Refused after writes");
  })
  .post("/api/items/:id/error-after-writes", async (c) => {
    await db.update(items).set({ title: "Must roll back" }).where(eq(items.id, c.req.param("id")));
    throw new Error("Intentional rollback test");
  })
  .onError(onError);

async function fixture() {
  const actor = nanoid(), other = nanoid(), group = nanoid(), project = nanoid(), list = nanoid(), inbox = nanoid(), otherInbox = nanoid(), item = nanoid();
  await db.insert(users).values([{ id: actor, name: "Writer", email: `${actor}@example.test` }, { id: other, name: "Watcher", email: `${other}@example.test` }]);
  await db.insert(groups).values({ id: group, name: "Sync", keyPrefix: "SYNC", ownerId: actor });
  await db.insert(projects).values({ id: project, groupId: group, name: "Sync" });
  await db.insert(lists).values([{ id: list, projectId: project, name: "To do" }, { id: inbox, kind: "inbox", userId: actor, name: "Inbox" }, { id: otherInbox, kind: "inbox", userId: other, name: "Inbox" }]);
  await db.insert(members).values([{ projectId: project, userId: actor, role: "owner" }, { projectId: project, userId: other, role: "editor" }]);
  await db.insert(items).values({ id: item, projectId: project, listId: list, title: "Original", createdBy: actor });
  await db.insert(itemWatchers).values({ itemId: item, userId: other });
  viewers.set(actor, { userId: actor, inboxListId: inbox, name: "Writer", email: `${actor}@example.test`, isAnonymous: false });
  viewers.set(other, { userId: other, inboxListId: otherInbox, name: "Watcher", email: `${other}@example.test`, isAnonymous: false });
  return { actor, other, project, list, inbox, otherInbox, item };
}
const send = (actor: string, path: string, method: string, body?: unknown, operationId = nanoid(), version?: number) => app.request(`/api${path}`, {
  method, headers: { "content-type": "application/json", "X-Test-Actor": actor, "X-Todoi-Operation-Id": operationId, ...(version === undefined ? {} : { "X-Todoi-Base-Version": String(version) }) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const receipt = (actor: string, operationId: string) => db.select().from(operationReceipts).where(and(eq(operationReceipts.actorId, actor), eq(operationReceipts.operationId, operationId)));
const versionOf = async (id: string) => (await db.select({ version: items.version }).from(items).where(eq(items.id, id)))[0]!.version;

describe("workspace operation receipts", () => {
  it("replays a lost create response exactly once, including activity, assignment notifications and key counters", async () => {
    const f = await fixture(), operation = nanoid(), id = nanoid();
    const input = { id, title: "Queued task", listId: f.list, assigneeIds: [f.other] };
    const first = await send(f.actor, "/items", "POST", input, operation);
    const firstBody = await first.text();
    expect(first.status).toBe(201);
    const second = await send(f.actor, "/items", "POST", input, operation);
    expect(second.status).toBe(201);
    expect(await second.text()).toBe(firstBody);
    expect(second.headers.get("X-Todoi-Replayed")).toBe("true");
    expect(second.headers.get("X-Todoi-Version")).toBe(String(await versionOf(id)));
    expect(await db.select().from(items).where(eq(items.id, id))).toHaveLength(1);
    expect(await db.select().from(items).where(eq(items.listId, f.otherInbox))).toHaveLength(1);
    expect(await db.select().from(activity).where(eq(activity.itemId, id))).toHaveLength(1);
    expect(await receipt(f.actor, operation)).toHaveLength(1);
  });

  it("serializes concurrent duplicate comments and their notification/activity side effects", async () => {
    const f = await fixture(), operation = nanoid(), id = nanoid();
    const responses = await Promise.all(Array.from({ length: 6 }, () => send(f.actor, `/items/${f.item}/comments`, "POST", { id, body: "Saved comment" }, operation)));
    expect(responses.map((r) => r.status)).toEqual([201, 201, 201, 201, 201, 201]);
    const bodies = await Promise.all(responses.map((r) => r.text()));
    expect(new Set(bodies).size).toBe(1);
    expect(await db.select().from(comments).where(eq(comments.itemId, f.item))).toHaveLength(1);
    expect(await db.select().from(activity).where(eq(activity.itemId, f.item))).toHaveLength(1);
    expect(await db.select().from(items).where(eq(items.listId, f.otherInbox))).toHaveLength(1);
    expect(await receipt(f.actor, operation)).toHaveLength(1);
  });

  it("rejects reused operation ids for different bodies and scopes receipts to the actor", async () => {
    const f = await fixture(), operation = nanoid();
    expect((await send(f.actor, `/items/${f.item}`, "PATCH", { title: "First" }, operation)).status).toBe(200);
    expect((await send(f.actor, `/items/${f.item}`, "PATCH", { title: "Second" }, operation)).status).toBe(409);
    expect((await send(f.other, `/items/${f.item}`, "PATCH", { title: "Other actor" }, operation)).status).toBe(200);
    expect(await receipt(f.actor, operation)).toHaveLength(1);
    expect(await receipt(f.other, operation)).toHaveLength(1);
  });

  it("checks present permissions before returning a previously committed receipt", async () => {
    const f = await fixture(), operation = nanoid();
    expect((await send(f.other, `/items/${f.item}`, "PATCH", { title: "Allowed then" }, operation)).status).toBe(200);
    await db.delete(members).where(and(eq(members.projectId, f.project), eq(members.userId, f.other)));
    expect((await send(f.other, `/items/${f.item}`, "PATCH", { title: "Allowed then" }, operation)).status).toBe(403);
  });

  it("acknowledges hard deletes using retained scope but refuses the replay after permission loss", async () => {
    const f = await fixture(), create = await send(f.other, `/items/${f.item}/comments`, "POST", { id: nanoid(), body: "Delete me" });
    const comment = await create.json() as { id: string }, operation = nanoid();
    expect((await send(f.other, `/comments/${comment.id}`, "DELETE", undefined, operation)).status).toBe(204);
    expect((await send(f.other, `/comments/${comment.id}`, "DELETE", undefined, operation)).status).toBe(204);
    await db.delete(members).where(and(eq(members.projectId, f.project), eq(members.userId, f.other)));
    expect((await send(f.other, `/comments/${comment.id}`, "DELETE", undefined, operation)).status).toBe(403);
  });

  it("rolls back nested writes and saves no receipt when a route refuses or throws after writing", async () => {
    const f = await fixture();
    for (const [action, status] of [["refuse-after-writes", 400], ["error-after-writes", 500]] as const) {
      const operation = nanoid();
      expect((await send(f.actor, `/items/${f.item}/${action}`, "POST", {}, operation)).status).toBe(status);
      expect((await db.select().from(items).where(eq(items.id, f.item)))[0]?.title).toBe("Original");
      expect(await db.select().from(comments).where(eq(comments.itemId, f.item))).toHaveLength(0);
      expect(await receipt(f.actor, operation)).toHaveLength(0);
    }
  });

  it("rolls back item, activity, key counter and receipt when notification delivery fails", async () => {
    const f = await fixture(), operation = nanoid(), id = nanoid();
    notificationFailure.userId = f.other;
    const response = await send(f.actor, "/items", "POST", { id, title: "Retry later", listId: f.list, assigneeIds: [f.other] }, operation);
    notificationFailure.userId = "";
    expect(response.status).toBe(500);
    expect(await db.select().from(items).where(eq(items.id, id))).toHaveLength(0);
    expect(await db.select().from(activity).where(eq(activity.itemId, id))).toHaveLength(0);
    expect(await receipt(f.actor, operation)).toHaveLength(0);
    expect((await send(f.actor, "/items", "POST", { id, title: "Retry later", listId: f.list, assigneeIds: [f.other] }, operation)).status).toBe(201);
  });

  it("uses locked versions to preserve stale edits and acknowledge subsequent same-entity edits", async () => {
    const f = await fixture(), base = await versionOf(f.item), operation = nanoid();
    const first = await send(f.actor, `/items/${f.item}`, "PATCH", { description: "Mine" }, operation, base);
    expect(first.status).toBe(200);
    const acknowledged = Number(first.headers.get("X-Todoi-Version"));
    expect(acknowledged).toBeGreaterThan(base);
    // Replaying the acknowledged operation ignores its now-old precondition.
    expect((await send(f.actor, `/items/${f.item}`, "PATCH", { description: "Mine" }, operation, base)).status).toBe(200);
    const staleId = nanoid(), stale = await send(f.other, `/items/${f.item}`, "PATCH", { description: "Unsent text" }, staleId, base);
    expect(stale.status).toBe(409);
    expect((await stale.json() as { error: string }).error).toContain("saved change has been kept");
    expect(await receipt(f.other, staleId)).toHaveLength(0);
    expect((await send(f.actor, `/items/${f.item}`, "PATCH", { title: "Next queued edit" }, nanoid(), acknowledged)).status).toBe(200);
  });

  it("refuses queued writes when the active session differs from the owner who saved them", async () => {
    const f = await fixture(), operation = nanoid();
    const response = await app.request(`/api/items/${f.item}`, { method: "PATCH", headers: { "content-type": "application/json", "X-Test-Actor": f.other, "X-Todoi-Owner-Id": f.actor, "X-Todoi-Operation-Id": operation }, body: JSON.stringify({ title: "Wrong account" }) });
    expect(response.status).toBe(401);
    expect((await db.select().from(items).where(eq(items.id, f.item)))[0]?.title).toBe("Original");
    expect(await receipt(f.actor, operation)).toHaveLength(0);
    expect(await receipt(f.other, operation)).toHaveLength(0);
  });

  it("deduplicates attachment metadata and deletion while cleaning files only after commit", async () => {
    const f = await fixture(), id = nanoid(), storageKey = await saveUpload(Buffer.from("Attached bytes"));
    await db.insert(attachments).values({ id, itemId: f.item, name: "original.txt", storageKey, uploadedBy: f.actor });
    const renameOp = nanoid(), renamed = await send(f.actor, `/attachments/${id}`, "PATCH", { name: "renamed.txt" }, renameOp, 1);
    expect(renamed.status).toBe(200);
    expect(renamed.headers.get("X-Todoi-Version")).toBe("2");
    expect((await send(f.actor, `/attachments/${id}`, "PATCH", { name: "renamed.txt" }, renameOp, 1)).status).toBe(200);
    const refused = await send(f.actor, `/items/${f.item}/refuse-after-delete`, "POST", {});
    expect(refused.status).toBe(400);
    expect(await db.select().from(attachments).where(eq(attachments.id, id))).toHaveLength(1);
    expect((await readUpload(storageKey))?.toString()).toBe("Attached bytes");
    const deleteOp = nanoid();
    expect((await send(f.actor, `/attachments/${id}`, "DELETE", undefined, deleteOp, 2)).status).toBe(204);
    expect(await readUpload(storageKey)).toBeNull();
    expect((await send(f.actor, `/attachments/${id}`, "DELETE", undefined, deleteOp, 2)).status).toBe(204);
  });

  it("allows only one concurrent edit against the same base version", async () => {
    const f = await fixture(), base = await versionOf(f.item);
    const responses = await Promise.all([
      send(f.actor, `/items/${f.item}`, "PATCH", { description: "Device one" }, nanoid(), base),
      send(f.other, `/items/${f.item}`, "PATCH", { description: "Device two" }, nanoid(), base),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await db.select().from(items).where(eq(items.id, f.item)))[0]?.description).toMatch(/^Device (one|two)$/);
  });

  it("acknowledges versions of related peers touched by a move without masking prior remote edits", async () => {
    const source = await fixture(), destination = await fixture(), peer = nanoid();
    await db.insert(members).values({ projectId: destination.project, userId: source.actor, role: "editor" });
    await db.insert(items).values({ id: peer, projectId: source.project, listId: source.list, title: "Related peer", position: 1 });
    await db.insert(itemRelations).values({ itemId: source.item, targetId: peer, type: "related" });
    const baseline = await versionOf(peer), operation = nanoid();
    const input = { listId: destination.list, position: 0 };
    const moved = await send(source.actor, `/items/${source.item}/move`, "POST", input, operation, await versionOf(source.item));
    expect(moved.status).toBe(200);
    const result = await moved.json() as { __syncVersions: Record<string, { before: number; after: number }> };
    const acknowledged = result.__syncVersions[`items/${peer}`]!;
    expect(acknowledged.before).toBe(baseline);
    expect(acknowledged.after).toBe(await versionOf(peer));
    expect(acknowledged.after).toBeGreaterThan(baseline);
    expect((await send(source.actor, `/items/${peer}/move`, "POST", input, nanoid(), baseline)).status).toBe(409);
    expect((await send(source.actor, `/items/${peer}/move`, "POST", input, nanoid(), acknowledged.after)).status).toBe(200);
    const replayed = await send(source.actor, `/items/${source.item}/move`, "POST", input, operation);
    expect((await replayed.json() as typeof result).__syncVersions).toEqual(result.__syncVersions);

    const remote = await fixture(), remotePeer = nanoid();
    await db.insert(members).values({ projectId: destination.project, userId: remote.actor, role: "editor" });
    await db.insert(items).values({ id: remotePeer, projectId: remote.project, listId: remote.list, title: "Remote peer", position: 1 });
    await db.insert(itemRelations).values({ itemId: remote.item, targetId: remotePeer, type: "related" });
    const staleBase = await versionOf(remotePeer);
    await db.update(items).set({ description: "Another device's new text" }).where(eq(items.id, remotePeer));
    const remoteMove = await send(remote.actor, `/items/${remote.item}/move`, "POST", input, nanoid(), await versionOf(remote.item));
    expect(remoteMove.status).toBe(200);
    const remoteVersions = (await remoteMove.json() as typeof result).__syncVersions[`items/${remotePeer}`]!;
    expect(remoteVersions.before).toBeGreaterThan(staleBase);
    expect((await send(remote.actor, `/items/${remotePeer}/move`, "POST", input, nanoid(), staleBase)).status).toBe(409);
    expect((await db.select().from(items).where(eq(items.id, remotePeer)))[0]?.description).toBe("Another device's new text");
  });

  it("acknowledges affected peer versions on bodyless permanent deletes and preserves earlier remote conflicts", async () => {
    const f = await fixture(), peer = nanoid(), operation = nanoid();
    await db.insert(items).values({ id: peer, projectId: f.project, listId: f.list, title: "Delete next", position: 1 });
    await db.insert(itemRelations).values({ itemId: f.item, targetId: peer, type: "related" });
    const baseline = await versionOf(peer);
    const response = await send(f.actor, `/archive/items/${f.item}`, "DELETE", undefined, operation, await versionOf(f.item));
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    const header = response.headers.get("X-Todoi-Affected-Versions")!;
    const affected = JSON.parse(header) as Record<string, { before: number; after: number }>;
    expect(affected[`items/${peer}`]).toEqual({ before: baseline, after: await versionOf(peer) });
    const replayed = await send(f.actor, `/archive/items/${f.item}`, "DELETE", undefined, operation);
    expect(replayed.status).toBe(204);
    expect(replayed.headers.get("X-Todoi-Affected-Versions")).toBe(header);
    expect((await send(f.actor, `/archive/items/${peer}`, "DELETE", undefined, nanoid(), baseline)).status).toBe(409);
    expect((await send(f.actor, `/archive/items/${peer}`, "DELETE", undefined, nanoid(), affected[`items/${peer}`]!.after)).status).toBe(204);

    const remote = await fixture(), remotePeer = nanoid();
    await db.insert(items).values({ id: remotePeer, projectId: remote.project, listId: remote.list, title: "Changed elsewhere", position: 1 });
    await db.insert(itemRelations).values({ itemId: remote.item, targetId: remotePeer, type: "related" });
    const stale = await versionOf(remotePeer);
    await db.update(items).set({ description: "Preserve another device's text" }).where(eq(items.id, remotePeer));
    const removed = await send(remote.actor, `/archive/items/${remote.item}`, "DELETE", undefined, nanoid(), await versionOf(remote.item));
    expect(removed.status).toBe(204);
    const remoteAffected = JSON.parse(removed.headers.get("X-Todoi-Affected-Versions")!) as typeof affected;
    expect(remoteAffected[`items/${remotePeer}`]!.before).toBeGreaterThan(stale);
    expect((await send(remote.actor, `/archive/items/${remotePeer}`, "DELETE", undefined, nanoid(), stale)).status).toBe(409);
    expect((await db.select().from(items).where(eq(items.id, remotePeer)))[0]?.description).toBe("Preserve another device's text");
  });

  it("bumps item detail versions and exposes the new version for relationship writes", async () => {
    const f = await fixture(), base = await versionOf(f.item);
    const labelId = nanoid();
    await db.insert(labels).values({ id: labelId, projectId: f.project, name: "Label", color: "blue" });
    const response = await send(f.actor, `/items/${f.item}/labels`, "PUT", { labelIds: [labelId] }, nanoid(), base);
    expect(response.status).toBe(200);
    const after = Number(response.headers.get("X-Todoi-Version"));
    expect(after).toBeGreaterThan(base);
    expect((await send(f.actor, `/items/${f.item}/assignees`, "PUT", { userIds: [] }, nanoid(), after)).status).toBe(200);
    const latest = await versionOf(f.item);
    expect((await send(f.actor, `/items/${f.item}/comments`, "POST", { id: nanoid(), body: "Parent version" }, nanoid(), latest)).status).toBe(201);
    expect(await versionOf(f.item)).toBeGreaterThan(latest);
  });

  it("guards comment and label edits and allows legacy writes without operation/precondition headers", async () => {
    const f = await fixture(), created = await send(f.actor, `/items/${f.item}/comments`, "POST", { id: nanoid(), body: "Original" });
    const comment = await created.json() as { id: string; version: number };
    expect((await send(f.actor, `/comments/${comment.id}`, "PATCH", { body: "Updated" }, nanoid(), comment.version)).status).toBe(200);
    expect((await send(f.actor, `/comments/${comment.id}`, "PATCH", { body: "Stale" }, nanoid(), comment.version)).status).toBe(409);
    const labelId = nanoid();
    await db.insert(labels).values({ id: labelId, projectId: f.project, name: "Original", color: "blue" });
    expect((await send(f.actor, `/labels/${labelId}`, "PATCH", { name: "Updated" }, nanoid(), 1)).status).toBe(200);
    expect((await send(f.actor, `/labels/${labelId}`, "PATCH", { name: "Stale" }, nanoid(), 1)).status).toBe(409);
    expect((await app.request(`/api/items/${f.item}`, { method: "PATCH", headers: { "content-type": "application/json", "X-Test-Actor": f.actor }, body: JSON.stringify({ title: "Legacy client" }) })).status).toBe(200);
  });
});

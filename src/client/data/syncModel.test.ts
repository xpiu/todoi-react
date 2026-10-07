import { describe, expect, it } from "vitest";

import type { Item } from "./api";
import { optimisticCreate } from "./itemOptimism";
import { acknowledgeReplies, createdCommentVersion, projectFor, reactionIntent, reconcileSnapshot, resourceFor, rowFor } from "./syncModel";
import type { LocalWorkspace, SyncOperation } from "./syncStorage";

const now = "2026-10-06T00:00:00.000Z";
function operation(path: string, method: string, body: unknown = {}, extra: Partial<SyncOperation> = {}): SyncOperation {
  return { id: `operation-${path}`, path, method, body: JSON.stringify(body), state: "pending", createdAt: now, attempts: 0, ...extra };
}
function workspace(operations: SyncOperation[] = [], replies: Record<string, unknown> = {}): LocalWorkspace {
  return { ownerId: "writer", user: { id: "writer", name: "Writer", email: "writer@example.test", isAnonymous: false }, queries: { queries: [], mutations: [] }, operations, replies: Object.fromEntries(Object.entries(replies).map(([path, value]) => [path, { body: JSON.stringify(value) }])), lastSynced: null };
}
function item(id = "item-one", fields: Partial<Item> = {}): Item {
  const [row] = optimisticCreate([], { id, title: "Server title" }, { listId: "list-one", projectId: "project-one", statusRole: "TODO" });
  return { ...row!, version: 7, createdAt: now, updatedAt: now, ...fields };
}

describe("sync resource and authoritative version resolution", () => {
  it("uses the acknowledged new comment's version for dependent edits and reactions, separate from its parent", () => {
    const create = operation("/api/items/item-one/comments", "POST", { id: "new-comment", body: "First draft" });
    const edit = operation("/api/comments/new-comment", "PATCH", { body: "Edited offline" });
    const reaction = operation("/api/comments/new-comment/reactions", "POST", { emoji: "👍" });
    expect(resourceFor(create.path, JSON.parse(create.body))).toBe("items/item-one");
    const acknowledged = createdCommentVersion(create, JSON.stringify({ id: "new-comment", itemId: "item-one", body: "First draft", version: 3 }));
    expect(acknowledged).toEqual({ resource: "comments/new-comment", version: 3 });
    expect(resourceFor(edit.path, JSON.parse(edit.body))).toBe(acknowledged?.resource);
    expect(resourceFor(reaction.path, JSON.parse(reaction.body))).toBe(acknowledged?.resource);
  });

  it("accepts only the exact acknowledged comment create, without borrowing unrelated entity versions", () => {
    const response = JSON.stringify({ id: "new-comment", version: 1 });
    expect(createdCommentVersion(operation("/api/items/item-one/comments", "POST", { id: "other-comment" }), response)).toBeUndefined();
    expect(createdCommentVersion(operation("/api/items/item-one/comments", "POST", { body: "No stable id" }), response)).toBeUndefined();
    expect(createdCommentVersion(operation("/api/comments/new-comment", "PATCH", { body: "Edit" }), response)).toBeUndefined();
    expect(createdCommentVersion(operation("/api/comments/new-comment/reactions", "POST", { emoji: "👍" }), response)).toBeUndefined();
    expect(createdCommentVersion(operation("/api/lists", "POST", { id: "new-comment" }), response)).toBeUndefined();
    expect(createdCommentVersion(operation("/api/items/item-one/comments", "POST", { id: "new-comment" }), "")).toBeUndefined();
  });

  it("rejects missing, nonnumeric, nonpositive and unsafe new comment versions", () => {
    const create = operation("/api/items/item-one/comments", "POST", { id: "new-comment" });
    for (const version of [undefined, "1", 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(createdCommentVersion(create, JSON.stringify({ id: "new-comment", version }))).toBeUndefined();
    }
  });

  it("targets parent item content writes, comment edits and archived rows like server preconditions", () => {
    expect(resourceFor("/api/items/item-one/comments", { id: "comment-one" })).toBe("items/item-one");
    expect(resourceFor("/api/items/item-one/assignees", {})).toBe("items/item-one");
    expect(resourceFor("/api/comments/comment-one/reactions", {})).toBe("comments/comment-one");
    expect(resourceFor("/api/archive/items/item-one", {})).toBe("items/item-one");
    expect(resourceFor("/api/items", { id: "new-item" })).toBe("items/new-item");
    expect(resourceFor("/api/projects/import", {})).toBeUndefined();
    expect(resourceFor("/api/me/prefs", {})).toBeUndefined();
  });

  it("resolves persisted list/comment/project rows without reading optimistic counters", () => {
    const record = workspace([], {
      "/api/groups": [{ id: "group-one", projects: [{ id: "project-one", version: 3 }] }],
      "/api/projects/project-one": { id: "project-one", version: 4, lists: [{ id: "list-one", version: 2 }] },
      "/api/items/item-one/details": { comments: [{ id: "comment-one", version: 5, itemId: "item-one" }] },
    });
    expect(rowFor(record, "lists/list-one")?.version).toBe(2);
    expect(rowFor(record, "comments/comment-one")?.version).toBe(5);
    expect(rowFor(record, "projects/project-one")?.version).toBe(4);
  });

  it("uses the newest authoritative version when list and detail snapshots disagree", () => {
    const record = workspace([], {
      "/api/items?projectId=project-one": [item("item-one", { version: 7 })],
      "/api/items/item-one": { id: "item-one", version: 9, projectId: "project-one" },
    });
    expect(rowFor(record, "items/item-one")?.version).toBe(9);
  });

  it("uses archived item and project versions for restore and permanent delete preconditions", () => {
    const record = workspace([], {
      "/api/items?projectId=project-one": [item("item-one", { version: 7 })],
      "/api/groups": [{ id: "group-one", projects: [{ id: "project-one", version: 2 }] }],
      "/api/archive": { items: [item("item-one", { version: 10, deletedAt: now })], projects: [{ id: "project-one", version: 8, deletedAt: now, name: "Trashed project" }] },
    });
    expect(rowFor(record, resourceFor("/api/archive/items/item-one", {})!)?.version).toBe(10);
    expect(rowFor(record, resourceFor("/api/archive/projects/project-one", {})!)?.version).toBe(8);
    expect(projectFor(record, "/api/archive/items/item-one")).toBe("project-one");
    expect(rowFor(record, "projects/project-one")).toMatchObject({ name: "Trashed project", deletedAt: now });
  });

  it("merges full authoritative fields with newer narrow target metadata regardless of cache order", () => {
    const full = item("item-one", { version: 7, description: "Full-row note", dueDate: "2026-10-12", labelIds: ["label-one"], assigneeIds: ["person-one"] });
    const target = { id: "item-one", version: 9, title: "Newest title", listId: "list-one", projectId: "project-one" };
    for (const replies of [
      { "/api/items?projectId=project-one": [full], "/api/items/item-one": target },
      { "/api/items/item-one": target, "/api/items?projectId=project-one": [full] },
    ]) {
      expect(rowFor(workspace([], replies), "items/item-one")).toMatchObject({ version: 9, title: "Newest title", description: "Full-row note", dueDate: "2026-10-12", status: "TODO", labelIds: ["label-one"], assigneeIds: ["person-one"] });
    }
  });

  it("resolves project scope through unsynced list, item and comment creates", () => {
    const record = workspace([
      operation("/api/lists", "POST", { id: "new-list", projectId: "project-one", name: "New list" }),
      operation("/api/items", "POST", { id: "new-item", listId: "new-list", title: "Draft" }),
      operation("/api/items/new-item/comments", "POST", { id: "new-comment", body: "Unsent text" }),
    ]);
    expect(projectFor(record, "/api/items/new-item", { description: "Edited draft" })).toBe("project-one");
    expect(projectFor(record, "/api/comments/new-comment", { body: "Edited comment" })).toBe("project-one");
    expect(projectFor(record, "/api/items/new-item/details")).toBe("project-one");
  });

  it("resolves cached attachment scope through an unsynced parent and terminates cyclic lineage", () => {
    const record = workspace([operation("/api/items", "POST", { id: "new-item", listId: "list-one", title: "Draft" })], {
      "/api/projects/project-one": { id: "project-one", lists: [{ id: "list-one", projectId: "project-one" }] },
      "/api/items/new-item/details": { attachments: [{ id: "attachment-one", itemId: "new-item", version: 2 }] },
    });
    expect(projectFor(record, "/api/attachments/attachment-one")).toBe("project-one");
    const cyclic = workspace([
      operation("/api/items", "POST", { id: "cycle-one", parentItemId: "cycle-two", title: "One" }),
      operation("/api/items", "POST", { id: "cycle-two", parentItemId: "cycle-one", title: "Two" }),
    ]);
    expect(projectFor(cyclic, "/api/items/cycle-one")).toBeUndefined();
    expect(projectFor(workspace(), "/api/projects/import", {})).toBeUndefined();
  });

  it("finds attachment versions in item details and follows content rows to their project", () => {
    const record = workspace([], {
      "/api/items?projectId=project-one": [item()],
      "/api/items/item-one/details": { comments: [{ id: "comment-one", itemId: "item-one", version: 3 }], attachments: [{ id: "attachment-one", itemId: "item-one", version: 4 }] },
    });
    expect(rowFor(record, "attachments/attachment-one")?.version).toBe(4);
    expect(projectFor(record, "/api/comments/comment-one")).toBe("project-one");
    expect(projectFor(record, "/api/attachments/attachment-one")).toBe("project-one");
  });
});

describe("pending workspace projections", () => {
  it("overlays only unsent fields and preserves incoming unrelated rows, fields and versions", () => {
    const snapshot = [item("item-one", { title: "New remote title", description: "Remote description", dueDate: "2026-10-09", version: 9 }), item("item-two", { title: "Other remote task", version: 5 })];
    const original = structuredClone(snapshot);
    const record = workspace([operation("/api/items/item-one", "PATCH", { description: "Unsent local text" })]);
    const projected = reconcileSnapshot("/api/items?projectId=project-one", snapshot, record) as Item[];
    expect(projected[0]).toMatchObject({ title: "New remote title", description: "Unsent local text", dueDate: "2026-10-09", version: 9 });
    expect(projected[1]).toEqual(snapshot[1]);
    expect(snapshot).toEqual(original);
    expect(record.operations[0]?.body).toContain("Unsent local text");
  });

  it("guards an already advanced recurrence but retains its other pending fields", () => {
    const current = item("item-one", { dueDate: "2026-10-07", startDate: "2026-10-06", repeatRule: { freq: "daily", interval: 1 }, repeatCount: 1 });
    const record = workspace([operation("/api/items/item-one", "PATCH", { done: true, ifDue: "2026-10-06", description: "Keep this note" })]);
    const [projected] = reconcileSnapshot("/api/items?projectId=project-one", [current], record) as Item[];
    expect(projected).toMatchObject({ done: false, status: "TODO", dueDate: "2026-10-07", startDate: "2026-10-06", repeatCount: 1, description: "Keep this note" });
  });

  it("projects a fresh recurring completion using the shared occurrence rules", () => {
    const current = item("item-one", { dueDate: "2026-10-06", startDate: "2026-10-05", repeatRule: { freq: "daily", interval: 1 }, repeatCount: 0 });
    const record = workspace([operation("/api/items/item-one", "PATCH", { done: true, ifDue: "2026-10-06" })]);
    const [projected] = reconcileSnapshot("/api/items?projectId=project-one", [current], record) as Item[];
    expect(projected).toMatchObject({ done: false, dueDate: "2026-10-07", startDate: "2026-10-06", repeatCount: 1 });
  });

  it("projects a queued list before its dependent item and keeps that item's create id", () => {
    const record = workspace([
      operation("/api/lists", "POST", { id: "new-list", projectId: "project-one", name: "Doing", statusRole: "DOING" }),
      operation("/api/items", "POST", { id: "new-item", listId: "new-list", title: "New item" }),
    ], { "/api/projects/project-one": { id: "project-one", lists: [] } });
    expect(projectFor(record, "/api/items", { listId: "new-list" })).toBe("project-one");
    const project = reconcileSnapshot("/api/projects/project-one", { id: "project-one", lists: [] }, record) as { lists: Array<{ id: string }> };
    expect(project.lists).toMatchObject([{ id: "new-list" }]);
    const [created] = reconcileSnapshot("/api/items?projectId=project-one", [], record) as Item[];
    expect(created).toMatchObject({ id: "new-item", listId: "new-list", projectId: "project-one", title: "New item", status: "DOING", version: 0 });
  });

  it("uses list roles at the dependent create's position, honoring earlier patches and explicit item statuses", () => {
    const record = workspace([
      operation("/api/lists", "POST", { id: "new-list", projectId: "project-one", name: "Doing", statusRole: "TODO" }),
      operation("/api/lists/new-list", "PATCH", { statusRole: "DOING" }),
      operation("/api/items", "POST", { id: "inherited-item", listId: "new-list", title: "Inherited" }),
      operation("/api/items", "POST", { id: "explicit-item", listId: "new-list", title: "Explicit", status: "BACKLOG" }),
      operation("/api/lists/new-list", "PATCH", { statusRole: "DONE", applyToExisting: false }),
    ]);
    const rows = reconcileSnapshot("/api/items?projectId=project-one", [], record) as Item[];
    expect(rows.find((row) => row.id === "inherited-item")).toMatchObject({ status: "DOING", done: false });
    expect(rows.find((row) => row.id === "explicit-item")).toMatchObject({ status: "BACKLOG", done: false });
  });

  it("projects a dependent comment create and edit once while preserving remote comments", () => {
    const record = workspace([
      operation("/api/items", "POST", { id: "new-item", listId: "list-one", title: "New item" }),
      operation("/api/items/new-item/comments", "POST", { id: "new-comment", body: "Initial draft" }),
      operation("/api/comments/new-comment", "PATCH", { body: "Edited draft" }),
    ]);
    const remote = { comments: [{ id: "remote-comment", body: "Remote reply", version: 2 }], assigneeIds: ["someone"] };
    const projected = reconcileSnapshot("/api/items/new-item/details", remote, record) as typeof remote;
    expect(projected.comments).toHaveLength(2);
    expect(projected.comments[0]).toEqual(remote.comments[0]);
    expect(projected.comments[1]).toMatchObject({ id: "new-comment", body: "Edited draft", authorId: "writer", version: 0 });
    expect(projected.assigneeIds).toEqual(["someone"]);
    const confirmed = { comments: [{ id: "new-comment", body: "Server-confirmed comment", version: 1 }] };
    expect((reconcileSnapshot("/api/items/new-item/details", confirmed, record) as typeof confirmed).comments).toHaveLength(1);
  });

  it("never resurrects missing server rows from edits, or refused creates after access loss", () => {
    const deleted = workspace([operation("/api/items/item-one", "PATCH", { description: "Saved text" })]);
    expect(reconcileSnapshot("/api/items?projectId=project-one", [], deleted)).toEqual([]);
    for (const status of [403, 404]) {
      const lost = workspace([operation("/api/items", "POST", { id: "new-item", listId: "list-one", title: "Kept for recovery" }, { state: "failed", status })], { "/api/projects/project-one": { id: "project-one", lists: [{ id: "list-one", projectId: "project-one" }] } });
      expect(reconcileSnapshot("/api/items?projectId=project-one", [], lost)).toEqual([]);
      expect(lost.operations[0]?.body).toContain("Kept for recovery");
    }
  });

  it("hides dependent subitems for both queued Trash paths", () => {
    const rows = [item(), item("child", { parentItemId: "item-one" }), item("other")];
    for (const op of [operation("/api/items/item-one", "DELETE"), operation("/api/items/item-one", "PATCH", { deleted: true })]) {
      expect((reconcileSnapshot("/api/items?projectId=project-one", rows, workspace([op])) as Item[]).map((row) => row.id)).toEqual(["other"]);
    }
  });

  it("moves complete authoritative rows into destination snapshots and deduplicates their family", () => {
    const root = item("item-one", { description: "Move this note", labelIds: ["label-one"], dueDate: "2026-10-12" });
    const child = item("child", { parentItemId: "item-one", description: "Child note" });
    const record = workspace([operation("/api/items/item-one/move", "POST", { listId: "destination-list", position: 0 })], {
      "/api/items?projectId=project-one": [root, child],
      "/api/items?listId=list-one": [root, child],
      "/api/items/item-one": { id: "item-one", version: 9, title: "Latest target title", listId: "list-one", projectId: "project-one" },
      "/api/projects/project-two": { id: "project-two", lists: [{ id: "destination-list", projectId: "project-two" }] },
    });
    const moved = reconcileSnapshot("/api/items?projectId=project-two", [], record) as Item[];
    expect(moved).toHaveLength(2);
    expect(moved.find((row) => row.id === "item-one")).toMatchObject({ title: "Latest target title", description: "Move this note", labelIds: ["label-one"], dueDate: "2026-10-12", status: "TODO", version: 9, projectId: "project-two", listId: "destination-list" });
    expect(moved.find((row) => row.id === "child")).toMatchObject({ parentItemId: "item-one", description: "Child note", projectId: "project-two", listId: "destination-list" });
  });

  it("projects profile fields alongside preferences while preserving fresh account data", () => {
    const record = workspace([
      operation("/api/me", "PATCH", { name: "Local name", nickname: "local", avatarColor: "teal" }),
      operation("/api/me/prefs", "PATCH", { theme: "dark" }),
    ]);
    const remote = { id: "writer", name: "Remote name", nickname: "old", avatarColor: "blue", email: "new-address@example.test", prefs: { theme: "light", notifyAssignments: false } };
    expect(reconcileSnapshot("/api/me", remote, record)).toEqual({ ...remote, name: "Local name", nickname: "local", avatarColor: "teal", prefs: { theme: "dark", notifyAssignments: false } });
    expect(remote.name).toBe("Remote name");
  });

  it("projects reaction toggles for the actor without replacing comment text or other people's reactions", () => {
    const remote = { comments: [{ id: "comment-one", body: "Keep remote text", version: 4, reactions: [{ commentId: "comment-one", userId: "other", emoji: "👍" }] }], attachments: [] };
    const add = operation("/api/comments/comment-one/reactions", "POST", { emoji: "👍" });
    const first = reconcileSnapshot("/api/items/item-one/details", remote, workspace([add])) as typeof remote;
    expect(first.comments[0]).toEqual({ ...remote.comments[0], reactions: [...remote.comments[0]!.reactions, { commentId: "comment-one", userId: "writer", emoji: "👍" }] });
    const second = reconcileSnapshot("/api/items/item-one/details", remote, workspace([add, { ...add, id: "toggle-again" }])) as typeof remote;
    expect(second.comments).toEqual(remote.comments);
    const unknownDelete = workspace([operation("/api/comments/comment-one/reactions/%F0%9F%91%8D", "DELETE")]);
    expect(reconcileSnapshot("/api/items/item-one/details", remote, unknownDelete)).toEqual(remote);
    expect(remote.comments[0]!.reactions).toHaveLength(1);
  });

  it("captures reaction intent from previous pending projections without changing its replay body", () => {
    const path = "/api/comments/comment-one/reactions";
    const record = workspace([], { "/api/items/item-one/details": { comments: [{ id: "comment-one", itemId: "item-one", reactions: [] }] } });
    const draft = operation(path, "POST", { emoji: "👍" });
    const originalBody = draft.body;
    expect(reactionIntent(record, draft)).toBe(true);
    record.operations.push({ ...draft, reactionActive: true });
    expect(reactionIntent(record, draft)).toBe(false);
    expect(draft.body).toBe(originalBody);
    expect(reactionIntent(record, operation("/api/comments/comment-one", "PATCH", { body: "Edit" }))).toBeUndefined();
    expect(reactionIntent(workspace(), draft)).toBeUndefined();
  });

  it("keeps desired reaction state when incoming snapshots already include a committed toggle", () => {
    const mine = { commentId: "comment-one", userId: "writer", emoji: "👍" };
    const other = { commentId: "comment-one", userId: "other", emoji: "👍" };
    const draft = operation("/api/comments/comment-one/reactions", "POST", { emoji: "👍" }, { reactionActive: true });
    const record = workspace([draft]);
    const confirmed = { comments: [{ id: "comment-one", body: "Fresh remote text", version: 5, reactions: [mine, other] }] };
    const projected = reconcileSnapshot("/api/items/item-one/details", confirmed, record) as typeof confirmed;
    expect(projected.comments[0]).toEqual(confirmed.comments[0]);
    const remove = workspace([{ ...draft, reactionActive: false }]);
    const alreadyRemoved = { comments: [{ ...confirmed.comments[0], reactions: [other] }] };
    expect(reconcileSnapshot("/api/items/item-one/details", alreadyRemoved, remove)).toEqual(alreadyRemoved);
    expect((reconcileSnapshot("/api/items/item-one/details", confirmed, remove) as typeof confirmed).comments[0]?.reactions).toEqual([other]);
  });

  it("captures reaction intent on a comment whose create is still queued", () => {
    const record = workspace([operation("/api/items/new-item/comments", "POST", { id: "new-comment", body: "Draft comment" })]);
    const draft = operation("/api/comments/new-comment/reactions", "POST", { emoji: "👍" });
    expect(reactionIntent(record, draft)).toBe(true);
    record.operations.push({ ...draft, reactionActive: true });
    expect(reactionIntent(record, draft)).toBe(false);
  });

  it("keeps pending comment edits when toggling reactions and deletes only the exact comment route", () => {
    const snapshot = { comments: [{ id: "comment-one", body: "Remote", reactions: [{ commentId: "comment-one", userId: "writer", emoji: "👍" }, { commentId: "comment-one", userId: "writer", emoji: "❤️" }] }, { id: "comment-two", body: "Other", reactions: [] }] };
    const edited = workspace([operation("/api/comments/comment-one", "PATCH", { body: "Saved draft" }), operation("/api/comments/comment-one/reactions", "POST", { emoji: "👍" })]);
    const result = reconcileSnapshot("/api/items/item-one/details", snapshot, edited) as typeof snapshot;
    expect(result.comments[0]).toMatchObject({ body: "Saved draft", reactions: [{ userId: "writer", emoji: "❤️" }] });
    expect(result.comments[1]).toEqual(snapshot.comments[1]);
    const deleted = reconcileSnapshot("/api/items/item-one/details", snapshot, workspace([operation("/api/comments/comment-one", "DELETE")])) as typeof snapshot;
    expect(deleted.comments.map((comment) => comment.id)).toEqual(["comment-two"]);
  });

  it("projects attachment rename and removal without resurrecting deleted files or changing comments", () => {
    const snapshot = { comments: [{ id: "comment-one", body: "Remote note" }], attachments: [{ id: "attachment-one", name: "remote.txt", size: 23, version: 4 }, { id: "attachment-two", name: "other.txt", size: 7, version: 2 }] };
    const renamed = reconcileSnapshot("/api/items/item-one/details", snapshot, workspace([operation("/api/attachments/attachment-one", "PATCH", { name: "local.txt" })])) as typeof snapshot;
    expect(renamed.attachments[0]).toEqual({ ...snapshot.attachments[0], name: "local.txt" });
    expect(renamed.comments).toEqual(snapshot.comments);
    const removed = reconcileSnapshot("/api/items/item-one/details", snapshot, workspace([operation("/api/attachments/attachment-one", "DELETE")])) as typeof snapshot;
    expect(removed.attachments.map((attachment) => attachment.id)).toEqual(["attachment-two"]);
    const missing = reconcileSnapshot("/api/items/item-one/details", { attachments: [] }, workspace([operation("/api/attachments/attachment-one", "PATCH", { name: "saved.txt" })])) as { attachments: unknown[] };
    expect(missing.attachments).toEqual([]);
    expect(snapshot.attachments[0]!.name).toBe("remote.txt");
  });

  it("keeps unrelated incoming label and assignee changes when projecting unsent sets", () => {
    const snapshot = [item("item-one", { labelIds: ["remote-label"], assigneeIds: ["remote-person"], attachmentCount: 3 }), item("other", { labelIds: ["untouched"] })];
    const record = workspace([operation("/api/items/item-one/labels", "PUT", { labelIds: ["local-label"] })]);
    const projected = reconcileSnapshot("/api/items?projectId=project-one", snapshot, record) as Item[];
    expect(projected[0]).toMatchObject({ labelIds: ["local-label"], assigneeIds: ["remote-person"], attachmentCount: 3 });
    expect(projected[1]).toEqual(snapshot[1]);
  });
});


describe("confirmed reply durability", () => {
  it("retains acknowledged creates and comments after queue removal without a followup read", () => {
    const create = operation("/api/items", "POST", { id: "new-item", listId: "list-one", title: "Draft title" });
    let record = workspace([create], { "/api/items?projectId=project-one": [], "/api/items/new-item/details": { comments: [], attachments: [] } });
    const actual = item("new-item", { title: "Canonical created title", version: 1, keyNumber: 12 });
    record = { ...record, replies: acknowledgeReplies(record, create, JSON.stringify(actual)), operations: [] };
    expect(reconcileSnapshot("/api/items?projectId=project-one", JSON.parse(record.replies["/api/items?projectId=project-one"]!.body), record)).toMatchObject([{ id: "new-item", title: "Canonical created title", version: 1, keyNumber: 12 }]);
    const add = operation("/api/items/new-item/comments", "POST", { id: "comment-one", body: " Draft comment " });
    const comment = { id: "comment-one", itemId: "new-item", body: "Draft comment", version: 1, authorId: "writer", reactions: [], createdAt: now, updatedAt: now };
    record = { ...record, operations: [add], replies: acknowledgeReplies(record, add, JSON.stringify(comment)) };
    record.operations = [];
    expect(JSON.parse(record.replies["/api/items/new-item/details"]!.body).comments).toEqual([comment]);
  });

  it("folds only the acknowledged edit, leaving other pending fields out of the reply base", () => {
    const acknowledged = operation("/api/items/item-one", "PATCH", { description: "Confirmed note" });
    const pending = operation("/api/items/item-one", "PATCH", { title: "Unsent title" }, { id: "other-op" });
    const original = item("item-one", { title: "Latest remote title", description: "Old note", dueDate: "2026-10-12" });
    const record = workspace([acknowledged, pending], { "/api/items?projectId=project-one": [original] });
    const canonical = { ...original, description: "Confirmed note", version: 8 };
    const replies = acknowledgeReplies(record, acknowledged, JSON.stringify({ ...canonical, occurrence: null }));
    const [base] = JSON.parse(replies["/api/items?projectId=project-one"]!.body) as Item[];
    expect(base).toMatchObject({ title: "Latest remote title", description: "Confirmed note", dueDate: "2026-10-12", version: 8 });
    expect(base).not.toHaveProperty("occurrence");
    expect(JSON.parse(record.replies["/api/items?projectId=project-one"]!.body)[0].description).toBe("Old note");
    const remaining = { ...record, replies, operations: [pending] };
    expect((reconcileSnapshot("/api/items?projectId=project-one", [base], remaining) as Item[])[0]?.title).toBe("Unsent title");
  });

  it("retains the exact acknowledged recurrence instead of replaying completion after reload", () => {
    const before = item("item-one", { dueDate: "2026-10-06", startDate: "2026-10-05", repeatRule: { freq: "daily", interval: 1 }, repeatCount: 0 });
    const done = operation("/api/items/item-one", "PATCH", { done: true, ifDue: "2026-10-06" });
    const after = { ...before, dueDate: "2026-10-07", startDate: "2026-10-06", repeatCount: 1, version: 8 };
    const record = workspace([done], { "/api/items?projectId=project-one": [before] });
    const replies = acknowledgeReplies(record, done, JSON.stringify({ ...after, occurrence: { from: "2026-10-06", next: "2026-10-07", count: 1, ended: false } }));
    const emptyQueue = { ...record, replies, operations: [] };
    const [restored] = reconcileSnapshot("/api/items?projectId=project-one", JSON.parse(replies["/api/items?projectId=project-one"]!.body), emptyQueue) as Item[];
    expect(restored).toMatchObject({ dueDate: "2026-10-07", startDate: "2026-10-06", repeatCount: 1, done: false, version: 8 });
  });

  it("preserves a newer authoritative snapshot that arrived before an older delayed acknowledgment", () => {
    const latest = item("item-one", { description: "Later remote edit", version: 10, dueDate: "2026-10-12" });
    const op = operation("/api/items/item-one", "PATCH", { description: "Earlier own edit" });
    const record = workspace([op], { "/api/items?projectId=project-one": [latest] });
    const replies = acknowledgeReplies(record, op, JSON.stringify({ ...latest, description: "Earlier own edit", version: 8 }));
    expect(JSON.parse(replies["/api/items?projectId=project-one"]!.body)).toEqual([latest]);
  });

  it("stores confirmed comment, attachment, list, project and group fields and versions", () => {
    let record = workspace([], {
      "/api/items/item-one/details": { comments: [{ id: "comment-one", itemId: "item-one", body: "Old", reactions: [], version: 1 }], attachments: [{ id: "attachment-one", itemId: "item-one", name: "old.txt", version: 1 }] },
      "/api/projects/project-one": { id: "project-one", groupId: "group-one", name: "Old project", version: 1, lists: [{ id: "list-one", projectId: "project-one", name: "Old list", version: 1 }] },
      "/api/groups": [{ id: "group-one", name: "Old group", version: 1, projects: [{ id: "project-one", groupId: "group-one", name: "Old project", version: 1 }] }],
    });
    for (const [path, body, canonical] of [
      ["/api/comments/comment-one", { body: "Local comment" }, { id: "comment-one", itemId: "item-one", body: "Confirmed comment", reactions: [], version: 2 }],
      ["/api/attachments/attachment-one", { name: "local.txt" }, { id: "attachment-one", itemId: "item-one", name: "confirmed.txt", version: 2 }],
      ["/api/lists/list-one", { name: "Local list" }, { list: { id: "list-one", projectId: "project-one", name: "Confirmed list", version: 2 }, rewritten: 0 }],
      ["/api/projects/project-one", { name: "Local project" }, { id: "project-one", groupId: "group-one", name: "Confirmed project", version: 2 }],
      ["/api/groups/group-one", { name: "Local group" }, { id: "group-one", name: "Confirmed group", version: 2 }],
    ] as const) record = { ...record, replies: acknowledgeReplies(record, operation(path, "PATCH", body), JSON.stringify(canonical)) };
    expect(rowFor(record, "comments/comment-one")).toMatchObject({ body: "Confirmed comment", version: 2 });
    expect(rowFor(record, "attachments/attachment-one")).toMatchObject({ name: "confirmed.txt", version: 2 });
    expect(rowFor(record, "lists/list-one")).toMatchObject({ name: "Confirmed list", version: 2 });
    expect(rowFor(record, "projects/project-one")).toMatchObject({ name: "Confirmed project", version: 2 });
    expect(rowFor(record, "groups/group-one")).toMatchObject({ name: "Confirmed group", version: 2 });
  });

  it("preserves normalized cached preferences when confirming profile updates and flat preference responses", () => {
    let record = workspace([], { "/api/me": { id: "writer", name: "Old name", prefs: { theme: "light", notifyAssignments: false, notifyWatched: true } } });
    record = { ...record, replies: acknowledgeReplies(record, operation("/api/me", "PATCH", { name: "New name" }), JSON.stringify({ id: "writer", name: "New name", prefs: { theme: "light" } })) };
    expect(JSON.parse(record.replies["/api/me"]!.body).prefs.notifyAssignments).toBe(false);
    record = { ...record, replies: acknowledgeReplies(record, operation("/api/me/prefs", "PATCH", { theme: "dark" }), JSON.stringify({ theme: "dark", notifyAssignments: false, notifyWatched: true })) };
    expect(JSON.parse(record.replies["/api/me"]!.body)).toMatchObject({ name: "New name", prefs: { theme: "dark", notifyAssignments: false, notifyWatched: true } });
  });

  it("enriches acknowledged restores missing from live caches with saved relations and pointer state", () => {
    const archived = item("item-one", { archivedAt: now, labelIds: ["label-one"], assigneeIds: ["person-one"], attachmentCount: 2 });
    const op = operation("/api/items/item-one", "PATCH", { archived: false });
    const record = workspace([op], { "/api/items?projectId=project-one": [], "/api/archive": { items: [archived], projects: [] }, "/api/items/item-one": { id: "item-one", version: 7, title: "Server title", projectId: "project-one", listId: "list-one", state: "archived" } });
    const { labelIds: _labels, assigneeIds: _assignees, attachmentCount: _attachments, ...databaseRow } = archived;
    const replies = acknowledgeReplies(record, op, JSON.stringify({ ...databaseRow, archivedAt: null, version: 8, occurrence: null }));
    expect(JSON.parse(replies["/api/items?projectId=project-one"]!.body)[0]).toMatchObject({ labelIds: ["label-one"], assigneeIds: ["person-one"], attachmentCount: 2, version: 8, archivedAt: null });
    expect(JSON.parse(replies["/api/items/item-one"]!.body).state).toBe("live");
    expect(JSON.parse(replies["/api/archive"]!.body).items).toEqual([]);
  });

  it("supplies renderable item relations when only a database mutation row is available", () => {
    const op = operation("/api/items/item-one", "PATCH", { archived: false });
    const record = workspace([op], { "/api/items?projectId=project-one": [] });
    const row = item("item-one", { version: 8 });
    const { labelIds: _labels, assigneeIds: _assignees, attachmentCount: _attachments, ...databaseRow } = row;
    const replies = acknowledgeReplies(record, op, JSON.stringify(databaseRow));
    expect(JSON.parse(replies["/api/items?projectId=project-one"]!.body)[0]).toMatchObject({ labelIds: [], assigneeIds: [], attachmentCount: 0, title: "Server title", version: 8 });
  });

  it("folds canonical rewritten items included with list acknowledgments", () => {
    const before = item("item-one", { status: "TODO" });
    const op = operation("/api/lists/list-one", "PATCH", { statusRole: "DONE", applyToExisting: true });
    const record = workspace([op], { "/api/items?projectId=project-one": [before], "/api/projects/project-one": { id: "project-one", lists: [{ id: "list-one", projectId: "project-one", statusRole: "TODO", version: 1 }] } });
    const replies = acknowledgeReplies(record, op, JSON.stringify({ list: { id: "list-one", projectId: "project-one", statusRole: "DONE", version: 2 }, items: [{ ...before, status: "DONE", done: true, version: 8 }] }));
    expect(JSON.parse(replies["/api/items?projectId=project-one"]!.body)[0]).toMatchObject({ status: "DONE", done: true, version: 8 });
  });

  it("removes bodyless permanent item/project deletes from cached archives without removing unrelated rows", () => {
    const root = item("item-one", { deletedAt: now }), child = item("child", { parentItemId: "item-one", deletedAt: now }), other = item("other", { projectId: "project-two", deletedAt: now });
    const snapshot = { items: [root, child, other], projects: [{ id: "project-one", deletedAt: now }, { id: "project-two", deletedAt: now }] };
    const record = workspace([], { "/api/archive": snapshot, "/api/archive?projectId=project-one": { items: [root, child], projects: [] } });
    const deletedItem = acknowledgeReplies(record, operation("/api/archive/items/item-one", "DELETE"), "");
    expect(JSON.parse(deletedItem["/api/archive"]!.body).items.map((row: { id: string }) => row.id)).toEqual(["other"]);
    const deletedProject = acknowledgeReplies(record, operation("/api/archive/projects/project-one", "DELETE"), "");
    expect(JSON.parse(deletedProject["/api/archive"]!.body)).toEqual({ items: [other], projects: [{ id: "project-two", deletedAt: now }] });
    expect(JSON.parse(deletedProject["/api/archive?projectId=project-one"]!.body).items).toEqual([]);
  });

});

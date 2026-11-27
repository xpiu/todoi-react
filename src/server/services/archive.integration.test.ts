// Export everything and restore it: every field comes back in a fresh copy for the account restoring,
// other people's work keeps its attribution in text, files come back byte for byte, and a bad upload
// is refused before anything is written.
import { eq, inArray } from "drizzle-orm";
import { strToU8, unzipSync, zipSync } from "fflate";
import { nanoid } from "nanoid";
import { beforeAll, describe, expect, it } from "vitest";

import { ARCHIVE_MANIFEST } from "../../shared/archive";
import { call, signUp, type Person } from "../../../tests/integration/accounts";
import { app } from "../app";
import { inboxFor } from "../auth";
import { db } from "../db";
import { activity, attachments, commentReactions, comments, groups, itemAssignees, itemLabels, itemRelations, items, itemWatchers, labels, lists, members, projects, savedViews } from "../db/schema";
import { storeAttachments } from "./attachments";
import { readUpload } from "./uploads";

let flo: Person, sam: Person;
const ids = { group: nanoid(), project: nanoid(), todo: nanoid(), done: nanoid(), label: nanoid(), parent: nanoid(), sub: nanoid(), archived: nanoid(), trashed: nanoid(), inboxItem: nanoid(), c1: nanoid(), c2: nanoid() };

beforeAll(async () => {
  [flo, sam] = await Promise.all([signUp("Flo Zimmer"), signUp("Sam Verhoeven")]);
  const old = new Date("2026-09-01T10:00:00Z");
  await db.insert(groups).values({ id: ids.group, name: "Helicopters", icon: "plane", keyPrefix: "HE", ownerId: flo.id, nextItemNumber: 5 });
  await db.insert(projects).values({ id: ids.project, groupId: ids.group, name: "Website", color: "blue", description: "The new site", visibility: "shared", defaultView: "board", linkStatuses: false, createdAt: old });
  await db.insert(members).values([{ projectId: ids.project, userId: flo.id, role: "owner" }, { projectId: ids.project, userId: sam.id, role: "editor" }]);
  await db.insert(lists).values([{ id: ids.todo, projectId: ids.project, name: "To-do", statusRole: "TODO", position: 0 }, { id: ids.done, projectId: ids.project, name: "Done", statusRole: "DONE", position: 1, hidden: true }]);
  await db.insert(labels).values({ id: ids.label, projectId: ids.project, name: "design", color: "pink" });
  await db.insert(items).values([
    { id: ids.parent, projectId: ids.project, listId: ids.todo, keyNumber: 1, title: "Hero", description: "**Bold** plan", status: "DOING", priority: "HIGH", startDate: "2026-10-01", dueDate: "2026-10-03", dueTime: "14:30", repeatRule: { freq: "weekly" }, repeatCount: 2, position: 0, createdBy: sam.id, createdAt: old },
    { id: ids.sub, projectId: ids.project, listId: ids.todo, parentItemId: ids.parent, keyNumber: 2, title: "Crop", done: true, status: "DONE", priorStatus: "DOING", position: 0 },
    { id: ids.archived, projectId: ids.project, listId: ids.done, keyNumber: 3, title: "Old idea", archivedAt: old, position: 1 },
    { id: ids.trashed, projectId: ids.project, listId: ids.todo, keyNumber: 4, title: "Mistake", deletedAt: old, position: 2 },
  ]);
  await db.insert(itemLabels).values({ itemId: ids.parent, labelId: ids.label });
  await db.insert(itemAssignees).values([{ itemId: ids.parent, userId: flo.id }, { itemId: ids.parent, userId: sam.id }]);
  await db.insert(itemWatchers).values({ itemId: ids.parent, userId: flo.id });
  await db.insert(itemRelations).values({ itemId: ids.parent, targetId: ids.archived, type: "blocks" });
  await db.insert(comments).values([
    { id: ids.c1, itemId: ids.parent, authorId: sam.id, body: "Looks good", createdAt: new Date("2026-09-20T09:00:00Z") },
    { id: ids.c2, itemId: ids.parent, authorId: flo.id, body: "Thanks", replyToId: ids.c1, createdAt: new Date("2026-09-20T10:00:00Z") },
  ]);
  await db.insert(commentReactions).values([{ commentId: ids.c1, userId: flo.id, emoji: "👍" }, { commentId: ids.c1, userId: sam.id, emoji: "🎉" }]);
  await storeAttachments({ id: ids.parent, projectId: ids.project, title: "Hero" }, [new File([strToU8("hero bytes")], "hero.png", { type: "image/png" })], { userId: flo.id, isAnonymous: false });
  await db.insert(savedViews).values([{ id: nanoid(), projectId: ids.project, ownerId: sam.id, name: "Team view", shared: true, definition: { view: "board" } }, { id: nanoid(), projectId: ids.project, ownerId: sam.id, name: "Sam's own", shared: false, definition: {} }]);
  await db.insert(activity).values([{ id: nanoid(), projectId: ids.project, actorId: flo.id, type: "item", text: "moved “Hero”", itemId: ids.parent }, { id: nanoid(), projectId: ids.project, actorId: sam.id, type: "item", text: "edited “Hero”", itemId: ids.parent }]);
  const inbox = await inboxFor(flo.id);
  await db.insert(items).values({ id: ids.inboxItem, listId: inbox, title: "Call the bank" });
});

const exportOf = async (person: Person) => {
  const res = await call("/api/me/export", { cookie: person.cookie });
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("application/zip");
  return new Uint8Array(await res.arrayBuffer());
};
const restore = (person: Person, bytes: Uint8Array) => {
  const form = new FormData();
  form.set("file", new File([bytes as Uint8Array<ArrayBuffer>], "todoi-export.zip", { type: "application/zip" }));
  return app.request("/api/me/restore", { method: "POST", headers: { origin: process.env.APP_URL ?? "http://localhost:5173", cookie: person.cookie }, body: form });
};

describe("todoi archive", () => {
  it("exports everything, including the Trash, comments and file bytes", async () => {
    const files = unzipSync(await exportOf(flo));
    const manifest = JSON.parse(new TextDecoder().decode(files[ARCHIVE_MANIFEST]));
    expect(manifest).toMatchObject({ format: "todoi.archive", version: 1, account: { id: flo.id }, projects: [{ id: ids.project, name: "Website" }] });
    const project = JSON.parse(new TextDecoder().decode(files[`projects/${ids.project}.json`]));
    expect(project.items.map((i: { title: string }) => i.title).sort()).toEqual(["Crop", "Hero", "Mistake", "Old idea"]);
    expect(project.comments).toHaveLength(2);
    expect(project.attachments).toHaveLength(1);
    expect(new TextDecoder().decode(files[project.attachments[0].file])).toBe("hero bytes");
    expect(JSON.parse(new TextDecoder().decode(files["inbox.json"])).items.map((i: { title: string }) => i.title)).toEqual(["Call the bank"]);
  });

  it("restores a fresh copy for another account, with everything in place and others' work attributed", async () => {
    const zip = await exportOf(flo);
    const fresh = await signUp("Flo on a new account");
    const res = await restore(fresh, zip);
    expect(res.status).toBe(201);
    const summary = await res.json();
    expect(summary).toMatchObject({ groups: 1, projects: 1, items: 5, comments: 2, attachments: 1 });
    // A different address: nobody in the archive is the person restoring.
    expect(summary).toMatchObject({ inboxItems: 1, yours: false });
    expect(summary.notes).toEqual([
      "2 other members aren't added to the restored projects. Invite them again.",
      "2 comments by other people come back under your name, starting with their name and the original date.",
      "1 item was assigned to someone else. Their name stays on it, but it's no longer assigned to them.",
      "3 history entries by other people (like “Sam completed this”) are left out.",
    ]);

    const [group] = await db.select().from(groups).where(eq(groups.ownerId, fresh.id)).then((gs) => gs.filter((g) => g.name === "Helicopters"));
    expect(group).toMatchObject({ keyPrefix: "HE", icon: "plane", nextItemNumber: 5 });
    const [project] = await db.select().from(projects).where(eq(projects.groupId, group!.id));
    expect(project).toMatchObject({ name: "Website", color: "blue", description: "The new site", visibility: "shared", defaultView: "board", linkStatuses: false });
    expect(project!.id).not.toBe(ids.project);
    expect(await db.select({ userId: members.userId, role: members.role }).from(members).where(eq(members.projectId, project!.id))).toEqual([{ userId: fresh.id, role: "owner" }]);
    const ls = await db.select().from(lists).where(eq(lists.projectId, project!.id)).orderBy(lists.position);
    expect(ls.map((l) => [l.name, l.statusRole, l.hidden])).toEqual([["To-do", "TODO", false], ["Done", "DONE", true]]);
    const its = await db.select().from(items).where(eq(items.projectId, project!.id));
    const by = (t: string) => its.find((i) => i.title === t)!;
    expect(by("Hero")).toMatchObject({ keyNumber: 1, description: "**Bold** plan", status: "DOING", priority: "HIGH", startDate: "2026-10-01", dueDate: "2026-10-03", dueTime: "14:30", repeatRule: { freq: "weekly" }, repeatCount: 2, createdBy: null, syncExtra: { assignees: ["Flo Zimmer", "Sam Verhoeven"] } });
    expect(by("Crop")).toMatchObject({ parentItemId: by("Hero").id, done: true, priorStatus: "DOING" });
    expect(by("Old idea").archivedAt).not.toBeNull();
    expect(by("Mistake").deletedAt).not.toBeNull();
    expect((await db.select().from(itemLabels).where(eq(itemLabels.itemId, by("Hero").id))).length).toBe(1);
    expect(await db.select({ u: itemAssignees.userId }).from(itemAssignees).where(eq(itemAssignees.itemId, by("Hero").id))).toEqual([]);
    expect(await db.select({ u: itemWatchers.userId }).from(itemWatchers).where(eq(itemWatchers.itemId, by("Hero").id))).toEqual([]);
    expect(await db.select({ t: itemRelations.targetId, type: itemRelations.type }).from(itemRelations).where(eq(itemRelations.itemId, by("Hero").id))).toEqual([{ t: by("Old idea").id, type: "blocks" }]);
    const cs = await db.select().from(comments).where(eq(comments.itemId, by("Hero").id)).orderBy(comments.createdAt);
    expect(cs.map((c) => [c.authorId, c.body])).toEqual([[fresh.id, "**Sam Verhoeven** · 2026-09-20\n\nLooks good"], [fresh.id, "**Flo Zimmer** · 2026-09-20\n\nThanks"]]);
    expect(cs[1]!.replyToId).toBe(cs[0]!.id);
    expect(await db.select({ emoji: commentReactions.emoji }).from(commentReactions).where(inArray(commentReactions.commentId, cs.map((c) => c.id)))).toEqual([]);
    const [file] = await db.select().from(attachments).where(eq(attachments.itemId, by("Hero").id));
    expect(file).toMatchObject({ name: "hero.png", mime: "image/png", uploadedBy: fresh.id });
    expect(new TextDecoder().decode((await readUpload(file!.storageKey))!)).toBe("hero bytes");
    expect((await db.select({ name: savedViews.name }).from(savedViews).where(eq(savedViews.projectId, project!.id))).map((v) => v.name)).toEqual(["Team view"]);
    expect((await db.select({ text: activity.text }).from(activity).where(eq(activity.projectId, project!.id))).map((a) => a.text)).toEqual([]);
    const inbox = await inboxFor(fresh.id);
    expect((await db.select({ title: items.title }).from(items).where(eq(items.listId, inbox))).map((i) => i.title)).toEqual(["Call the bank"]);
  });

  it("keeps your own work yours when the address matches: assignments, reactions, activity", async () => {
    const files = unzipSync(await exportOf(flo));
    const manifest = JSON.parse(new TextDecoder().decode(files[ARCHIVE_MANIFEST]));
    const { restoringAs, summarizeArchive } = await import("../../shared/archive");
    const project = JSON.parse(new TextDecoder().decode(files[`projects/${ids.project}.json`]));
    expect([...restoringAs(manifest, { email: flo.email.toUpperCase() })]).toEqual([flo.id]);
    expect(summarizeArchive(manifest, [project], { email: flo.email })).toMatchObject({ yours: true, notes: [
      "1 other member isn't added to the restored projects. Invite them again.",
      "1 comment by someone else comes back under your name, starting with their name and the original date.",
      "1 item was assigned to someone else. Their name stays on it, but it's no longer assigned to them.",
      "1 history entry by someone else (like “Sam completed this”) is left out.",
    ] });
  });

  it("refuses what it can't restore, before writing anything", async () => {
    const someone = await signUp("Someone");
    const before = (await db.select().from(groups).where(eq(groups.ownerId, someone.id))).length;
    const not = await restore(someone, strToU8("hello"));
    expect(not.status).toBe(422);
    expect((await not.json()).error).toBe("This file isn't a todoi export. Choose the .zip file that Export everything downloaded.");
    const newer = await restore(someone, zipSync({ [ARCHIVE_MANIFEST]: strToU8(JSON.stringify({ format: "todoi.archive", version: 2 })) }));
    expect((await newer.json()).error).toBe("This export is from a newer version of todoi (format 2; this one reads 1). Reload the page to update, then try again.");
    const files = unzipSync(await exportOf(flo));
    delete files[`projects/${ids.project}.json`];
    expect((await (await restore(someone, zipSync(files))).json()).error).toBe(`This export is incomplete (projects/${ids.project}.json is missing). Run Export everything again and restore the new file.`);
    expect((await db.select().from(groups).where(eq(groups.ownerId, someone.id))).length).toBe(before);
  });
});

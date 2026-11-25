import { and, eq, inArray, or } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";

import { call, confirmIt, cookiesFrom, emailsTo, type Person, signIn, signUp } from "../../../tests/integration/accounts";
import { db } from "../db";
import { accounts, activity, apiTokens, attachments, commentReactions, comments, groups, invites, itemAssignees, items, itemWatchers, labels, lists, members, operationReceipts, passkeys, projects, savedViews, sessions, users, verifications } from "../db/schema";
import { inboxFor } from "../auth";
import { storeAttachments } from "./attachments";
import { setAvatar } from "./avatars";
import { openUpload } from "./uploads";

/** A group and a project owned by `owner`, with one list and `members` as editors. */
async function project(owner: Person, name: string, others: Person[] = []) {
  const groupId = nanoid(), projectId = nanoid(), listId = nanoid();
  await db.insert(groups).values({ id: groupId, name: `${name} group`, keyPrefix: "T", ownerId: owner.id });
  await db.insert(projects).values({ id: projectId, groupId, name });
  await db.insert(members).values([{ projectId, userId: owner.id, role: "owner" }, ...others.map((p) => ({ projectId, userId: p.id, role: "editor" as const }))]);
  await db.insert(lists).values({ id: listId, projectId, name: "To do" });
  return { groupId, projectId, listId };
}
async function item(where: { projectId: string | null; listId: string }, by: Person, title: string, parentItemId?: string) {
  const id = nanoid();
  await db.insert(items).values({ id, projectId: where.projectId, listId: where.listId, title, createdBy: by.id, parentItemId });
  return { id, projectId: where.projectId, title };
}
const file = (name: string) => new File([new Uint8Array(32).fill(66)], name, { type: "text/plain" });
const deletion = (p: Person) => call("/api/me/deletion", { cookie: p.cookie });
const remove = (p: Person, email = p.email) => call("/api/me/deletion", { cookie: p.cookie, json: { email } });

describe("deleting an account", () => {
  it("lists what goes and refuses while a project it owns has other members or its group holds someone else's project", async () => {
    const flo = await signUp("Flo"), sam = await signUp("Sam");
    await confirmIt(flo.cookie);
    const solo = await project(flo, "Solo");
    await item(solo, flo, "One");
    const shared = await project(flo, "Website", [sam]);
    const samsOwn = await project(sam, "Dealers");
    // Sam's project filed in Flo's group.
    await db.update(projects).set({ groupId: solo.groupId }).where(eq(projects.id, samsOwn.projectId));
    const review = (await (await deletion(flo)).json()) as { projects: Array<{ name: string; items: number }>; groups: Array<{ name: string; projects: number }>; memberOf: number; blockers: string[] };
    expect(review.projects).toEqual([expect.objectContaining({ name: "Solo", items: 1 })]);
    expect(review.groups.map((g) => [g.name, g.projects]).sort()).toEqual([["Solo group", 2], ["Website group", 1]]);
    expect(review.blockers).toEqual(["Transfer or delete “Website” first", "Ask Sam to move “Dealers” out of your group “Solo group” first"]);
    const refused = await remove(flo);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ error: "Transfer or delete “Website” first" });
    expect(await db.select({ id: users.id }).from(users).where(eq(users.id, flo.id))).toHaveLength(1);
    expect(await db.select({ id: projects.id }).from(projects).where(eq(projects.id, shared.projectId))).toHaveLength(1);
  });

  it("asks for the account email and sudo mode, never an API token", async () => {
    const flo = await signUp("Flo");
    expect(await (await remove(flo, "someone@example.test")).json()).toMatchObject({ fields: { email: "Type your account email exactly" } });
    // A log-in alone isn't sudo mode: confirm it's you first (services/sudo.ts).
    const stale = await remove(flo);
    expect(stale.status).toBe(403);
    expect(await stale.json()).toMatchObject({ fields: { sudo: "SUDO_REQUIRED" } });
    const token = (await (await call("/api/me/tokens", { cookie: flo.cookie, json: { name: "CI", access: "write" } })).json()) as { secret: string };
    expect((await call("/api/me/deletion", { headers: { authorization: `Bearer ${token.secret}` }, json: { email: flo.email } })).status).toBe(401);
    expect(await db.select({ id: users.id }).from(users).where(eq(users.id, flo.id))).toHaveLength(1);
  });

  it("removes everything only the account owns, files included, and keeps other people's data with its name on it", async () => {
    const flo = await signUp("Flo Zuallaert"), sam = await signUp("Sam Verhoeven");
    await confirmIt(flo.cookie);
    // Flo's own project: items, a subitem, a comment, a label, a saved view, an invite, attachments.
    const own = await project(flo, "Solo");
    const ownItem = await item(own, flo, "Draft");
    await item(own, flo, "Step", ownItem.id);
    await db.insert(comments).values({ id: nanoid(), itemId: ownItem.id, authorId: flo.id, body: "note to self" });
    await db.insert(labels).values({ id: nanoid(), projectId: own.projectId, name: "Mine", color: "blue" });
    await db.insert(savedViews).values({ id: nanoid(), projectId: own.projectId, ownerId: flo.id, name: "Mine", definition: {} });
    await db.insert(invites).values({ id: nanoid(), code: nanoid(12), projectId: own.projectId, email: "x@example.test", invitedBy: flo.id, expiresAt: new Date(Date.now() + 86400_000) });
    const [ownFile] = await storeAttachments(ownItem, [file("own.txt")], { userId: flo.id, isAnonymous: false });
    // Flo's Inbox, with a file.
    const inbox = await inboxFor(flo.id);
    const inboxItem = await item({ projectId: null, listId: inbox }, flo, "Inbox thought");
    const [inboxFile] = await storeAttachments(inboxItem, [file("inbox.txt")], { userId: flo.id, isAnonymous: false });
    // Sam's project where Flo works: Flo comments, reacts, uploads, is assigned and watches; Sam comments too.
    const sams = await project(sam, "Dealers", [flo]);
    const samsItem = await item(sams, sam, "Price list");
    const floItem = await item(sams, flo, "Flo's item in Sam's project");
    const floComment = nanoid(), samComment = nanoid();
    await db.insert(comments).values([{ id: floComment, itemId: samsItem.id, authorId: flo.id, body: "Looks good" }, { id: samComment, itemId: samsItem.id, authorId: sam.id, body: "Thanks" }]);
    await db.insert(commentReactions).values({ commentId: samComment, userId: flo.id, emoji: "👍" });
    await db.insert(itemAssignees).values([{ itemId: samsItem.id, userId: flo.id }, { itemId: samsItem.id, userId: sam.id }]);
    await db.insert(itemWatchers).values({ itemId: samsItem.id, userId: flo.id });
    await db.insert(savedViews).values({ id: nanoid(), projectId: sams.projectId, ownerId: flo.id, name: "Flo's view", definition: {}, shared: true });
    const [floUpload] = await storeAttachments(samsItem, [file("for-sam.txt")], { userId: flo.id, isAnonymous: false });
    const avatar = await setAvatar(flo.id, new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(24).fill(0)])], "a.png", { type: "image/png" }));
    const avatarKey = avatar.image!.split("/").pop()!;
    await call("/api/me/tokens", { cookie: flo.cookie, json: { name: "CI" } });
    await db.insert(passkeys).values({ id: nanoid(), name: "Laptop", userId: flo.id, publicKey: "pk", credentialID: nanoid(), counter: 0, deviceType: "singleDevice", backedUp: false });
    await call("/api/me/email-change", { cookie: flo.cookie, json: { email: `${nanoid(8).toLowerCase()}@example.test` } });
    await call("/api/auth/request-password-reset", { json: { email: flo.email, redirectTo: "/reset" } });
    // Two wrong passwords at the confirm step (services/sudo.ts) are on the count.
    await db.insert(verifications).values({ id: nanoid(), identifier: `sudo-tries:${flo.id}`, value: "2", expiresAt: new Date(Date.now() + 600_000) });
    expect((await emailsTo(flo.email)).map((m) => m.subject)).toContain("Reset your Todoi password");
    for (const key of [ownFile!.storageKey, inboxFile!.storageKey, floUpload!.storageKey, avatarKey]) expect(await openUpload(key)).not.toBeNull();

    const res = await remove(flo, flo.email.toUpperCase());
    expect(res.status).toBe(204);

    // Gone: the solo project with everything in it, the groups, the Inbox, files and every way back in.
    expect(await db.select().from(projects).where(eq(projects.id, own.projectId))).toEqual([]);
    expect(await db.select().from(items).where(or(eq(items.projectId, own.projectId), eq(items.listId, inbox)))).toEqual([]);
    expect(await db.select().from(lists).where(or(eq(lists.projectId, own.projectId), eq(lists.userId, flo.id)))).toEqual([]);
    expect(await db.select().from(groups).where(eq(groups.ownerId, flo.id))).toEqual([]);
    expect(await db.select().from(labels).where(eq(labels.projectId, own.projectId))).toEqual([]);
    expect(await db.select().from(invites).where(eq(invites.projectId, own.projectId))).toEqual([]);
    expect(await db.select().from(attachments).where(inArray(attachments.id, [ownFile!.id, inboxFile!.id]))).toEqual([]);
    for (const key of [ownFile!.storageKey, inboxFile!.storageKey, avatarKey]) expect(await openUpload(key)).toBeNull();
    for (const table of [sessions, accounts, apiTokens, passkeys]) expect(await db.select().from(table).where(eq(table.userId, flo.id))).toEqual([]);
    expect(await db.select().from(operationReceipts).where(eq(operationReceipts.actorId, flo.id))).toEqual([]);
    expect(await db.select().from(verifications).where(or(inArray(verifications.identifier, [`email-change:${flo.id}`, `sudo-tries:${flo.id}`]), eq(verifications.value, flo.id)))).toEqual([]);
    expect(await db.select().from(members).where(eq(members.userId, flo.id))).toEqual([]);
    expect(await db.select().from(itemAssignees).where(eq(itemAssignees.userId, flo.id))).toEqual([]);
    expect(await db.select().from(itemWatchers).where(eq(itemWatchers.userId, flo.id))).toEqual([]);
    expect(await db.select().from(savedViews).where(eq(savedViews.ownerId, flo.id))).toEqual([]);

    // Kept: Sam's project and items, both comments, the reaction, Flo's upload and item there, under Flo's name.
    expect(await db.select({ id: projects.id }).from(projects).where(eq(projects.id, sams.projectId))).toHaveLength(1);
    expect((await db.select({ id: items.id }).from(items).where(eq(items.projectId, sams.projectId))).map((r) => r.id).sort()).toEqual([samsItem.id, floItem.id].sort());
    expect((await db.select({ id: comments.id }).from(comments).where(eq(comments.itemId, samsItem.id))).map((r) => r.id).sort()).toEqual([floComment, samComment].sort());
    expect(await db.select().from(commentReactions).where(eq(commentReactions.commentId, samComment))).toHaveLength(1);
    expect(await db.select().from(itemAssignees).where(eq(itemAssignees.itemId, samsItem.id))).toEqual([{ itemId: samsItem.id, userId: sam.id }]);
    expect(await openUpload(floUpload!.storageKey)).not.toBeNull();
    const [plate] = await db.select().from(users).where(eq(users.id, flo.id));
    expect(plate).toMatchObject({ name: "Flo Zuallaert", email: `${flo.id}@deleted.invalid`, image: null, nickname: null, emailVerified: false });
    expect((await db.select({ text: activity.text }).from(activity).where(and(eq(activity.projectId, sams.projectId), eq(activity.type, "member")))).map((a) => a.text)).toContain("removed Flo Zuallaert, whose account was deleted");

    // Signed out here, and the old session (even its 60-second cookie cache) opens nothing; the address is free again.
    expect(cookiesFrom(res, flo.cookie)).not.toMatch(/session_token=/);
    expect((await call("/api/me", { cookie: flo.cookie })).status).toBe(401);
    expect((await call("/api/me", { cookie: cookiesFrom(res, flo.cookie) })).status).toBe(401);
    await expect(signIn(flo.email)).rejects.toThrow();
    const again = await signUp("Flo again", flo.email);
    expect(again.id).not.toBe(flo.id);
  });

  it("removes the account row itself when nothing else names it", async () => {
    const flo = await signUp("Flo");
    await confirmIt(flo.cookie);
    await project(flo, "Solo");
    expect((await remove(flo)).status).toBe(204);
    expect(await db.select().from(users).where(eq(users.id, flo.id))).toEqual([]);
    expect((await call("/api/me", { cookie: flo.cookie })).status).toBe(401);
  });
});

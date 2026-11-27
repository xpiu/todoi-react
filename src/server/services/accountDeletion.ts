// Self-service account deletion (Account › Data › Delete account; owner decisions D11, D13, D14).
// Immediate, in one transaction. What goes: the projects you own that nobody else works in (with their
// lists, items, comments, attachments and files, labels, saved views, invites and log), your project
// groups, your Inbox, your memberships, assignments and watches elsewhere, your saved views, API tokens,
// sessions, sign-in methods (password, passkeys), pending links and avatar. What stays: other people's projects and items,
// and what you wrote there — comments, reactions, uploads, activity, items you created — still under
// your stored name: when anything still points at the account, its row stays as a nameplate (no
// address, no way to sign in); when nothing does, the row goes too.
// Blockers (the deletion refuses while any exist): a project you own that other members work in, and
// another person's project filed in one of your groups.
import { and, count, eq, inArray, like, ne, or, sql } from "drizzle-orm";

import { afterCommit, db, type Tx } from "../db";
import { accounts, apiTokens, attachments, groups, itemAssignees, items, itemWatchers, lists, members, operationReceipts, passkeys, projects, savedViews, sessions, uploadCleanup, users, verifications } from "../db/schema";
import { ApiFailure } from "../errors";
import { logActivity } from "./activity";
import { avatarKey } from "./avatars";
import { drainUploadCleanup } from "./uploadCleanup";

export interface DeletionReview {
  /** Projects you own that only you work in: deleted */
  projects: Array<{ id: string; name: string; items: number }>;
  /** Project groups you own: deleted */
  groups: Array<{ id: string; name: string; projects: number }>;
  /** Files on items in those projects and in your Inbox */
  attachments: { count: number; bytes: number };
  /** Projects other people own that you leave */
  memberOf: number;
  /** What stops the deletion, one sentence each */
  blockers: string[];
}

const quote = (name: string) => `“${name}”`;

export async function deletionReview(userId: string, tx: Tx | typeof db = db): Promise<DeletionReview> {
  const mine = await tx.select({ projectId: members.projectId, role: members.role, name: projects.name, groupId: projects.groupId }).from(members).innerJoin(projects, eq(projects.id, members.projectId)).where(eq(members.userId, userId));
  const ownedIds = mine.filter((m) => m.role === "owner").map((m) => m.projectId);
  const others = ownedIds.length ? await tx.select({ projectId: members.projectId, n: count() }).from(members).where(and(inArray(members.projectId, ownedIds), ne(members.userId, userId))).groupBy(members.projectId) : [];
  const shared = new Set(others.filter((o) => o.n > 0).map((o) => o.projectId));
  const solo = mine.filter((m) => m.role === "owner" && !shared.has(m.projectId));
  const soloIds = solo.map((p) => p.projectId);
  const blockers = mine.filter((m) => shared.has(m.projectId)).map((m) => `Transfer or delete ${quote(m.name)} first`);

  // Groups go with the account, so nobody else's project may still be filed in one.
  const ownGroups = await tx.select({ id: groups.id, name: groups.name, deletedAt: groups.deletedAt }).from(groups).where(eq(groups.ownerId, userId));
  const groupIds = ownGroups.map((g) => g.id);
  const filed = groupIds.length ? await tx.select({ id: projects.id, name: projects.name, groupId: projects.groupId }).from(projects).where(inArray(projects.groupId, groupIds)) : [];
  const foreign = filed.filter((p) => !ownedIds.includes(p.id));
  if (foreign.length) {
    const owners = await tx.select({ projectId: members.projectId, name: users.name }).from(members).innerJoin(users, eq(users.id, members.userId)).where(and(inArray(members.projectId, foreign.map((p) => p.id)), eq(members.role, "owner")));
    for (const p of foreign) {
      const owner = owners.find((o) => o.projectId === p.id)?.name ?? "its owner";
      blockers.push(`Ask ${owner} to move ${quote(p.name)} out of your group ${quote(ownGroups.find((g) => g.id === p.groupId)?.name ?? "")} first`);
    }
  }

  const inbox = await tx.select({ id: lists.id }).from(lists).where(eq(lists.userId, userId));
  const itemScope = or(soloIds.length ? inArray(items.projectId, soloIds) : undefined, inbox.length ? inArray(items.listId, inbox.map((l) => l.id)) : undefined);
  // One after another: a transaction is one connection (pg 9 refuses overlapping queries on it).
  const itemCounts = soloIds.length ? await tx.select({ projectId: items.projectId, n: count() }).from(items).where(inArray(items.projectId, soloIds)).groupBy(items.projectId) : [];
  const [files] = itemScope ? await tx.select({ n: count(), bytes: sql<number>`coalesce(sum(${attachments.size}), 0)::bigint` }).from(attachments).innerJoin(items, eq(items.id, attachments.itemId)).where(itemScope) : [{ n: 0, bytes: 0 }];
  return {
    projects: solo.map((p) => ({ id: p.projectId, name: p.name, items: itemCounts.find((c) => c.projectId === p.projectId)?.n ?? 0 })),
    groups: ownGroups.filter((g) => !g.deletedAt).map((g) => ({ id: g.id, name: g.name, projects: filed.filter((p) => p.groupId === g.id).length })),
    attachments: { count: files?.n ?? 0, bytes: Number(files?.bytes ?? 0) },
    memberOf: mine.filter((m) => m.role !== "owner").length,
    blockers,
  };
}

/** The address a nameplate account gets: unique, undeliverable, never a real sign-in. */
export const deletedAddress = (userId: string) => `${userId}@deleted.invalid`;
export const isDeletedAddress = (email: string) => email.endsWith("@deleted.invalid");

/** Deletes the account and everything only it owns. Throws ApiFailure(409) while a blocker exists. */
export async function deleteAccount(userId: string): Promise<{ removed: boolean }> {
  const result = await db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
    if (!user) throw new ApiFailure(404, "This account no longer exists");
    // Membership changes in the account's projects wait for this transaction (and the check sees theirs).
    await tx.select({ id: projects.id }).from(projects).innerJoin(members, eq(members.projectId, projects.id)).where(eq(members.userId, userId)).for("update", { of: projects });
    const review = await deletionReview(userId, tx);
    if (review.blockers.length) throw new ApiFailure(409, review.blockers[0]!);

    // Projects only this account works in; foreign keys take their lists, items, comments, attachments
    // (whose DELETE trigger queues the files), labels, members, invites, saved views and log with them.
    if (review.projects.length) await tx.delete(projects).where(inArray(projects.id, review.projects.map((p) => p.id)));
    // The Inbox and anything else filed under the account.
    const own = (await tx.select({ id: lists.id }).from(lists).where(eq(lists.userId, userId))).map((l) => l.id);
    if (own.length) {
      await tx.delete(items).where(inArray(items.listId, own));
      await tx.delete(lists).where(inArray(lists.id, own));
    }
    await tx.delete(groups).where(eq(groups.ownerId, userId));

    // Other people's projects: the person leaves, the log says why (as todoi, so it needs no account).
    const left = await tx.delete(members).where(eq(members.userId, userId)).returning({ projectId: members.projectId });
    for (const m of left) await logActivity(tx, { projectId: m.projectId, actorId: null, type: "member", text: `removed ${user.name}, whose account was deleted` });
    await tx.delete(itemAssignees).where(eq(itemAssignees.userId, userId));
    await tx.delete(itemWatchers).where(eq(itemWatchers.userId, userId));
    await tx.delete(savedViews).where(eq(savedViews.ownerId, userId));

    // Every way back in, and what it left behind.
    await tx.delete(apiTokens).where(eq(apiTokens.userId, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx.delete(accounts).where(eq(accounts.userId, userId));
    await tx.delete(passkeys).where(eq(passkeys.userId, userId));
    await tx.delete(verifications).where(or(inArray(verifications.identifier, [`email-change:${userId}`, `sudo-tries:${userId}`]), and(like(verifications.identifier, "reset-password:%"), eq(verifications.value, userId))));
    await tx.delete(operationReceipts).where(eq(operationReceipts.actorId, userId));
    const avatar = avatarKey(user.image);
    if (avatar) await tx.insert(uploadCleanup).values({ storageKey: avatar }).onConflictDoNothing();

    // The row itself, unless something in other people's projects still names it (then a nameplate).
    try {
      await tx.transaction(async (sp) => {
        await sp.delete(users).where(eq(users.id, userId));
      });
      return { removed: true };
    } catch (error) {
      if ((error as { cause?: { code?: string } }).cause?.code !== "23503" && (error as { code?: string }).code !== "23503") throw error;
      await tx.update(users).set({ email: deletedAddress(userId), emailVerified: false, image: null, nickname: null, prefs: {} }).where(eq(users.id, userId));
      return { removed: false };
    }
  });
  await afterCommit(drainUploadCleanup);
  return result;
}

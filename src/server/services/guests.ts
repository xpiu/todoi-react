// Guests use the same workspace model as registered users. Linking an account moves ownership,
// retaining every content id; Better Auth then removes the anonymous user and its old sessions.
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { db } from "../db";
import { nextPosition } from "../db/position";
import { activity, attachments, comments, groups, invites, items, lists, savedViews, sessions, users } from "../db/schema";
import { ApiFailure } from "../errors";
import { deleteAccount } from "./accountDeletion";
import { createProject } from "./projects";

export async function createGuestWorkspace(userId: string) {
  await db.transaction(async (tx) => {
    const groupId = nanoid();
    await tx.insert(groups).values({ id: groupId, ownerId: userId, name: "Projects", keyPrefix: "PRO" });
    await createProject({ id: nanoid(), groupId, name: "New project", lists: [["To do", "TODO"]] }, userId, tx);
  });
}

export async function transferGuestWorkspace(guestId: string, userId: string) {
  await db.transaction(async (tx) => {
    // Serialize account linking and Inbox creation for these identities.
    const locked = await tx.select({ id: users.id, isAnonymous: users.isAnonymous }).from(users).where(inArray(users.id, [guestId, userId])).orderBy(users.id).for("update");
    if (!locked.find((u) => u.id === guestId)?.isAnonymous || !locked.find((u) => u.id === userId)) return;

    const inboxes = await tx.select({ id: lists.id, userId: lists.userId }).from(lists).where(and(eq(lists.kind, "inbox"), inArray(lists.userId, [guestId, userId])));
    const guestInbox = inboxes.find((l) => l.userId === guestId);
    const userInbox = inboxes.find((l) => l.userId === userId);
    if (guestInbox && userInbox) {
      const inboxEnd = await nextPosition(tx, items, eq(items.listId, userInbox.id));
      await tx.update(items).set({ position: sql`${items.position} + ${inboxEnd}` }).where(and(eq(items.listId, guestInbox.id), isNull(items.parentItemId)));
      await tx.update(items).set({ listId: userInbox.id }).where(eq(items.listId, guestInbox.id));
      await tx.delete(lists).where(eq(lists.id, guestInbox.id));
    }
    await tx.update(lists).set({ userId }).where(eq(lists.userId, guestId));
    const groupsEnd = await nextPosition(tx, groups, eq(groups.ownerId, userId));
    await tx.update(groups).set({ ownerId: userId, position: sql`${groups.position} + ${groupsEnd}` }).where(eq(groups.ownerId, guestId));

    // Unique person/content pairs merge without dropping either person's existing references.
    await tx.execute(sql`insert into members (project_id, user_id, role)
      select project_id, ${userId}, role from members where user_id = ${guestId}
      on conflict (project_id, user_id) do update set role = case
        when members.role = 'owner' or excluded.role = 'owner' then 'owner'::member_role
        when members.role = 'editor' or excluded.role = 'editor' then 'editor'::member_role
        else 'viewer'::member_role end`);
    await tx.execute(sql`delete from members where user_id = ${guestId}`);
    for (const table of ["item_assignees", "item_watchers"] as const) {
      await tx.execute(sql`insert into ${sql.identifier(table)} (item_id, user_id)
        select item_id, ${userId} from ${sql.identifier(table)} where user_id = ${guestId} on conflict do nothing`);
      await tx.execute(sql`delete from ${sql.identifier(table)} where user_id = ${guestId}`);
    }
    await tx.execute(sql`insert into comment_reactions (comment_id, user_id, emoji)
      select comment_id, ${userId}, emoji from comment_reactions where user_id = ${guestId} on conflict do nothing`);
    await tx.execute(sql`delete from comment_reactions where user_id = ${guestId}`);
    await tx.update(items).set({ createdBy: userId }).where(eq(items.createdBy, guestId));
    await tx.update(items).set({ notification: sql`jsonb_set(${items.notification}, '{fromUserId}', to_jsonb(${userId}::text))` }).where(sql`${items.notification}->>'fromUserId' = ${guestId}`);
    await tx.update(comments).set({ authorId: userId }).where(eq(comments.authorId, guestId));
    await tx.update(attachments).set({ uploadedBy: userId }).where(eq(attachments.uploadedBy, guestId));
    await tx.update(activity).set({ actorId: userId }).where(eq(activity.actorId, guestId));
    await tx.update(savedViews).set({ ownerId: userId }).where(eq(savedViews.ownerId, guestId));
    await tx.update(invites).set({ invitedBy: userId }).where(eq(invites.invitedBy, guestId));
    await tx.update(invites).set({ acceptedBy: userId }).where(eq(invites.acceptedBy, guestId));
  });
}

/** A guest workspace nobody has opened for this long is removed (its session lapsed long before: guests have no way back in). */
export const GUEST_IDLE_DAYS = 30;

/**
 * Every visitor makes a guest and a workspace; this removes the ones nobody came back to, with their
 * projects, Inbox and files (services/accountDeletion.ts). A guest whose project other people work in is
 * kept. At most `limit` per run; the trash-purge job runs it every six hours.
 */
export async function purgeIdleGuests(days = GUEST_IDLE_DAYS, limit = 200): Promise<{ removed: number; kept: number }> {
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const idle = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.isAnonymous, true), lt(users.createdAt, cutoff), sql`not exists (select 1 from ${sessions} where ${sessions.userId} = ${users.id} and ${sessions.updatedAt} >= ${cutoff})`))
    .limit(limit);
  let removed = 0;
  let kept = 0;
  for (const guest of idle) {
    try {
      await deleteAccount(guest.id);
      removed++;
    } catch (e) {
      if (!(e instanceof ApiFailure && e.status === 409)) throw e;
      kept++;
    }
  }
  return { removed, kept };
}

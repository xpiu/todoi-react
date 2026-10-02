// Guests use the same workspace model as registered users. Linking an account moves ownership,
// retaining every content id; Better Auth then removes the anonymous user and its old sessions.
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { db } from "../db";
import { activity, attachments, comments, groups, invites, items, lists, savedViews, users } from "../db/schema";
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
    const locked = await tx.select().from(users).where(inArray(users.id, [guestId, userId])).orderBy(users.id).for("update");
    if (!locked.find((u) => u.id === guestId)?.isAnonymous || !locked.find((u) => u.id === userId)) return;

    const inboxes = await tx.select().from(lists).where(and(eq(lists.kind, "inbox"), inArray(lists.userId, [guestId, userId])));
    const guestInbox = inboxes.find((l) => l.userId === guestId);
    const userInbox = inboxes.find((l) => l.userId === userId);
    if (guestInbox && userInbox) {
      const [end] = await tx.select({ n: sql<number>`coalesce(max(${items.position}), -1) + 1` }).from(items).where(eq(items.listId, userInbox.id));
      await tx.update(items).set({ position: sql`${items.position} + ${end!.n}` }).where(and(eq(items.listId, guestInbox.id), isNull(items.parentItemId)));
      await tx.update(items).set({ listId: userInbox.id }).where(eq(items.listId, guestInbox.id));
      await tx.delete(lists).where(eq(lists.id, guestInbox.id));
    }
    await tx.update(lists).set({ userId }).where(eq(lists.userId, guestId));
    const [lastGroup] = await tx.select({ n: sql<number>`coalesce(max(${groups.position}), -1) + 1` }).from(groups).where(eq(groups.ownerId, userId));
    await tx.update(groups).set({ ownerId: userId, position: sql`${groups.position} + ${lastGroup!.n}` }).where(eq(groups.ownerId, guestId));

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

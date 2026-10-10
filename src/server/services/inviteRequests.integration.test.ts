import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { expect, it } from "vitest";

import { db } from "../db";
import { groups, invites, items, members, projects, users } from "../db/schema";
import { inviteRequestId, requestNewInvite } from "./inviteRequests";

async function fixture() {
  const owner = nanoid(), actorId = nanoid(), group = nanoid(), project = nanoid(), code = nanoid();
  const actor = { userId: actorId, name: "Requester", email: `${actorId}@example.test` };
  await db.insert(users).values([{ id: owner, name: "Owner", email: `${owner}@example.test` }, { id: actorId, name: actor.name, email: actor.email }]);
  await db.insert(groups).values({ id: group, name: "Invites", keyPrefix: "IN", ownerId: owner });
  await db.insert(projects).values({ id: project, groupId: group, name: "Invites" });
  await db.insert(members).values({ projectId: project, userId: owner, role: "owner" });
  await db.insert(invites).values({ id: code, code, projectId: project, email: actor.email, role: "editor", invitedBy: owner, expiresAt: new Date(Date.now() - 86400000) });
  return { owner, actor, code, project };
}

it("concurrent requests create one unread Inbox notification without granting membership", async () => {
  const f = await fixture();
  await Promise.all([requestNewInvite(f.code, f.actor), requestNewInvite(f.code, f.actor)]);
  const notifications = await db.select().from(items).where(eq(items.id, inviteRequestId(f.code, f.actor.userId)));
  expect(notifications).toHaveLength(1);
  expect(notifications[0]).toMatchObject({ unread: true, title: "Requester requested a new invite to Invites", notification: { kind: "invite" } });
  expect((await db.select().from(members).where(eq(members.projectId, f.project))).map((m) => m.userId)).toEqual([f.owner]);
});

it("refuses wrong emails, live invites and withdrawn invites without creating a request", async () => {
  const f = await fixture();
  await expect(requestNewInvite(f.code, { ...f.actor, email: "another@example.test" })).rejects.toThrow("email address");
  await db.update(invites).set({ expiresAt: new Date(Date.now() + 86400000) }).where(eq(invites.code, f.code));
  await expect(requestNewInvite(f.code, f.actor)).rejects.toThrow("still works");
  await db.update(invites).set({ revokedAt: new Date() }).where(eq(invites.code, f.code));
  await expect(requestNewInvite(f.code, f.actor)).rejects.toThrow("no longer available");
  expect(await db.select().from(items).where(eq(items.id, inviteRequestId(f.code, f.actor.userId)))).toHaveLength(0);
});

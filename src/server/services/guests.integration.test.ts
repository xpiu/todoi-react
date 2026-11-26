// Guest workspaces nobody came back to are removed with everything in them; recent guests, guests whose
// project someone else works in, and accounts are kept.
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { call, cookiesFrom, signUp } from "../../../tests/integration/accounts";
import { db } from "../db";
import { groups, members, projects, sessions, users } from "../db/schema";
import { purgeIdleGuests } from "./guests";

const DAY = 86_400_000;

async function guest(): Promise<string> {
  const res = await call("/api/auth/sign-in/anonymous", { json: {} });
  expect(res.ok).toBe(true);
  const me = await call("/api/me", { cookie: cookiesFrom(res) });
  return ((await me.json()) as { id: string }).id;
}

/** As if the guest was last here `days` ago */
async function idleFor(userId: string, days: number) {
  const then = new Date(Date.now() - days * DAY);
  await db.update(users).set({ createdAt: then }).where(eq(users.id, userId));
  await db.update(sessions).set({ updatedAt: then }).where(eq(sessions.userId, userId));
}

describe("purging idle guest workspaces", () => {
  it("removes guests unseen for 30 days with their workspace, and keeps the rest", async () => {
    const [idle, recent, shared] = [await guest(), await guest(), await guest()];
    const account = await signUp("Account");
    await idleFor(idle, 31);
    await idleFor(recent, 10);
    await idleFor(shared, 31);
    await idleFor(account.id, 31);
    // Someone else works in the shared guest's project: deleting it would take their work too.
    const [sharedProject] = await db.select({ id: projects.id }).from(projects).innerJoin(groups, eq(groups.id, projects.groupId)).where(eq(groups.ownerId, shared));
    await db.insert(members).values({ projectId: sharedProject!.id, userId: account.id, role: "editor" });

    const ownedProjects = async (userId: string) => (await db.select({ id: projects.id }).from(projects).innerJoin(groups, eq(groups.id, projects.groupId)).where(eq(groups.ownerId, userId))).length;
    expect(await ownedProjects(idle)).toBe(1);

    expect(await purgeIdleGuests()).toEqual({ removed: 1, kept: 1 });
    expect(await db.$count(users, eq(users.id, idle))).toBe(0);
    expect(await ownedProjects(idle)).toBe(0);
    for (const kept of [recent, shared, account.id]) expect(await db.$count(users, eq(users.id, kept))).toBe(1);
  });
});

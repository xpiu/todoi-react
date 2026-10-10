import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { expect, it } from "vitest";

import { db } from "../db";
import { activity, groups, members, projects, users } from "../db/schema";
import { changeMembership } from "./members";

async function fixture() {
  const owner = nanoid(), first = nanoid(), second = nanoid(), project = nanoid(), group = nanoid();
  await db.insert(users).values([owner, first, second].map((id) => ({ id, name: id, email: `${id}@example.test` })));
  await db.insert(groups).values({ id: group, name: "Handover", keyPrefix: "HO", ownerId: owner });
  await db.insert(projects).values({ id: project, groupId: group, name: "Handover" });
  await db.insert(members).values([{ projectId: project, userId: owner, role: "owner" }, { projectId: project, userId: first, role: "editor" }, { projectId: project, userId: second, role: "viewer" }]);
  return { owner, first, second, project };
}

it("concurrent handovers leave exactly one owner and one activity entry", async () => {
  const f = await fixture();
  const results = await Promise.allSettled([f.first, f.second].map((userId) => changeMembership(f.project, f.owner, { kind: "transfer", userId })));
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect((await db.select().from(members).where(eq(members.projectId, f.project))).filter((m) => m.role === "owner")).toHaveLength(1);
  expect(await db.select().from(activity).where(eq(activity.projectId, f.project))).toHaveLength(1);
});

it("rejects owner removal or demotion and lets a viewer leave idempotently", async () => {
  const f = await fixture();
  await expect(changeMembership(f.project, f.owner, { kind: "remove", userId: f.owner })).rejects.toThrow("Transfer ownership");
  await expect(changeMembership(f.project, f.owner, { kind: "set", userId: f.owner, role: "editor" })).rejects.toThrow("Transfer ownership");
  await expect(changeMembership(f.project, f.second, { kind: "remove", userId: f.first })).rejects.toThrow("Only project admins");
  await changeMembership(f.project, f.second, { kind: "remove", userId: f.second });
  await changeMembership(f.project, f.second, { kind: "remove", userId: f.second });
  expect((await db.select().from(members).where(eq(members.projectId, f.project))).map((m) => m.userId).sort()).toEqual([f.owner, f.first].sort());
});

it("failed handovers preserve the owner and reject unregistered recipients", async () => {
  const f = await fixture();
  await expect(changeMembership(f.project, f.owner, { kind: "transfer", userId: f.owner })).rejects.toThrow("Choose another");
  await expect(changeMembership(f.project, f.owner, { kind: "transfer", userId: nanoid() })).rejects.toThrow("Choose another");
  await db.update(users).set({ isAnonymous: true }).where(eq(users.id, f.first));
  await expect(changeMembership(f.project, f.owner, { kind: "transfer", userId: f.first })).rejects.toThrow("registered account");
  expect((await db.select().from(members).where(eq(members.projectId, f.project))).find((m) => m.userId === f.owner)?.role).toBe("owner");
  expect(await db.select().from(activity).where(eq(activity.projectId, f.project))).toHaveLength(0);
});

import { and, eq } from "drizzle-orm";

import type { MemberRole } from "../../shared/enums";
import { db } from "../db";
import { members, projects, users } from "../db/schema";
import { ApiFailure } from "../errors";
import { logActivity } from "./activity";

type MembershipChange =
  | { kind: "transfer"; userId: string }
  | { kind: "set"; userId: string; role: Exclude<MemberRole, "owner"> }
  | { kind: "remove"; userId: string };

/** Serialize membership changes with handovers and recheck authority inside the lock. */
export async function changeMembership(projectId: string, actorId: string, change: MembershipChange) {
  return db.transaction(async (tx) => {
    const [project] = await tx.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).for("update");
    if (!project) throw new ApiFailure(404, "Project not found");
    const roster = await tx.select().from(members).where(eq(members.projectId, projectId));
    const actor = roster.find((m) => m.userId === actorId);
    const target = roster.find((m) => m.userId === change.userId);
    const selfRemoval = change.kind === "remove" && change.userId === actorId;
    if (!selfRemoval && actor?.role !== "owner" && actor?.role !== "admin") throw new ApiFailure(403, "Only project admins can change membership");
    if (change.kind === "transfer") {
      if (actor?.role !== "owner") throw new ApiFailure(403, "Only the owner can transfer ownership");
      if (!target || target.userId === actorId || target.role === "owner") throw new ApiFailure(400, "Choose another project member");
      const [user] = await tx.select().from(users).where(eq(users.id, target.userId));
      if (!user || user.isAnonymous) throw new ApiFailure(400, "The new owner needs a registered account");
      await tx.update(members).set({ role: "admin" }).where(and(eq(members.projectId, projectId), eq(members.userId, actorId)));
      await tx.update(members).set({ role: "owner" }).where(and(eq(members.projectId, projectId), eq(members.userId, target.userId)));
      await logActivity(tx, { projectId, actorId, type: "member", text: `transferred ownership to ${user.name}` });
    } else {
      if (target?.role === "owner") throw new ApiFailure(409, "Transfer ownership before changing or removing the owner");
      if (change.kind === "set") {
        await tx.insert(members).values({ projectId, userId: change.userId, role: change.role }).onConflictDoUpdate({ target: [members.projectId, members.userId], set: { role: change.role } });
      } else if (target) {
        await tx.delete(members).where(and(eq(members.projectId, projectId), eq(members.userId, change.userId)));
        await logActivity(tx, { projectId, actorId, type: "member", text: selfRemoval ? "left the project" : "removed a project member" });
      }
    }
  });
}

import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";

import { inboxFor } from "../auth";
import { db } from "../db";
import { invites, members, projects } from "../db/schema";
import { env } from "../env";
import { ApiFailure } from "../errors";
import { createInboxNotification } from "./notifications";

export const inviteRequestId = (code: string, userId: string) => createHash("sha256").update(JSON.stringify(["invite-request", code, userId])).digest("base64url").slice(0, 21);

/** One Inbox request per expired invite and person; it never grants access or sends email. */
export async function requestNewInvite(code: string, actor: { userId: string; name: string; email: string }) {
  const [original] = await db.select().from(invites).where(eq(invites.code, code));
  if (!original) throw new ApiFailure(404, "Invite not found");
  await db.transaction(async (tx) => {
    const [project] = await tx.select().from(projects).where(eq(projects.id, original.projectId)).for("update");
    const [invite] = await tx.select().from(invites).where(eq(invites.code, code)).for("update");
    if (!project || project.deletedAt || project.archivedAt || !invite || invite.revokedAt || invite.acceptedAt) throw new ApiFailure(410, "This invite is no longer available");
    if (invite.expiresAt > new Date()) throw new ApiFailure(409, "This invite still works. Accept it to join.");
    if (invite.email && invite.email.toLowerCase() !== actor.email.toLowerCase()) throw new ApiFailure(403, "Log in with the email address this invite was sent to");
    const roster = await tx.select().from(members).where(eq(members.projectId, project.id));
    if (roster.some((m) => m.userId === actor.userId)) throw new ApiFailure(409, "You're already a project member");
    const recipient = roster.find((m) => m.userId === invite.invitedBy && ["owner", "admin"].includes(m.role)) ?? roster.find((m) => m.role === "owner");
    if (!recipient) throw new ApiFailure(410, "No project admin is available. Contact the person who sent you the link.");
    await createInboxNotification(tx, await inboxFor(recipient.userId), actor.userId, {
      id: inviteRequestId(code, actor.userId),
      title: `${actor.name} requested a new invite to ${project.name}`,
      description: `The expired invite was for ${actor.email}. Create a new invite in project settings and send them its link.\n\n[Open project](${env.APP_URL}/p/${project.id})`,
      notification: { kind: "invite", fromUserId: actor.userId },
    });
  });
}

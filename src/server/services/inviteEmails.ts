// An invite to an email address is emailed to it: always when no account uses the address, and to an
// existing account only while its "Invites" email preference is on (DESIGN.md › Notifications). The email
// leaves after the invite is committed; a failed send is logged and the invite link still works.
import { eq, sql } from "drizzle-orm";

import { prefsOf } from "../../shared/prefs";
import { afterCommit, db } from "../db";
import { projects, users, type Member } from "../db/schema";
import { projectInviteEmail, sendEmail } from "../email";
import { env } from "../env";

export const inviteUrl = (code: string) => `${env.APP_URL}/i/${code}`;

export async function inviteWantsEmail(address: string): Promise<boolean> {
  const [user] = await db.select({ prefs: users.prefs }).from(users).where(eq(sql`lower(${users.email})`, address.toLowerCase()));
  return !user || prefsOf(user.prefs).emailInvites;
}

interface InviteRow { code: string; projectId: string; email: string | null; role: Member["role"]; expiresAt: Date }

/** True when the invite is being emailed (the response says so; the client words its toast by it). */
export async function emailInvite(invite: InviteRow, inviter: { name: string; email: string }): Promise<boolean> {
  if (!invite.email || !(await inviteWantsEmail(invite.email))) return false;
  const [project] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, invite.projectId));
  if (!project) return false;
  const to = invite.email;
  const message = projectInviteEmail({ email: to, inviterName: inviter.name, inviterEmail: inviter.email, projectName: project.name, role: invite.role, url: inviteUrl(invite.code), expiresAt: invite.expiresAt });
  await afterCommit(() => sendEmail({ to, ...message }).catch((error: unknown) => console.error(`The invite email to ${to} wasn't sent`, error)));
  return true;
}

import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";

import { call, confirmEmail, emailsTo, openLink, PASSWORD, signIn, signUp } from "../../../tests/integration/accounts";
import { db } from "../db";
import { groups, members, projects, users } from "../db/schema";
import { env } from "../env";

async function ownedProject(ownerId: string, name = "Website") {
  const groupId = nanoid(), projectId = nanoid();
  await db.insert(groups).values({ id: groupId, name: "Team", keyPrefix: "WEB", ownerId });
  await db.insert(projects).values({ id: projectId, groupId, name });
  await db.insert(members).values({ projectId, userId: ownerId, role: "owner" });
  return projectId;
}

describe("account emails over the API", () => {
  it("send a confirmation link at sign-up that lands on /verify-email and confirms the address", async () => {
    const person = await signUp("Flo");
    const [mail] = await emailsTo(person.email);
    expect(mail).toMatchObject({ subject: "Confirm your email for Todoi" });
    expect(mail!.text).toContain(`Confirm that ${person.email} is yours`);
    expect(mail!.link).toMatch(/\/api\/auth\/verify-email\?token=/);
    expect(new URL(mail!.link!).searchParams.get("callbackURL")).toBe(`${env.APP_URL}/verify-email`);
    const landing = await openLink(mail!.link!);
    expect(landing).toMatchObject({ status: 302, location: `${env.APP_URL}/verify-email` });
    expect((await db.select({ v: users.emailVerified }).from(users).where(eq(users.id, person.id)))[0]!.v).toBe(true);
  });

  it("send a reset link that works once, for an hour, and sets the new password", async () => {
    const person = await signUp("Reset");
    const asked = await call("/api/auth/request-password-reset", { json: { email: person.email, redirectTo: `${env.APP_URL}/reset?email=${encodeURIComponent(person.email)}` } });
    expect(asked.status).toBe(200);
    const mail = (await emailsTo(person.email)).find((m) => m.subject === "Reset your Todoi password");
    expect(mail?.text).toContain("The link works once and expires in 1 hour.");
    const landing = await openLink(mail!.link!);
    const target = new URL(landing.location!);
    expect(`${target.origin}${target.pathname}`).toBe(`${env.APP_URL}/reset`);
    expect(target.searchParams.get("email")).toBe(person.email);
    const token = target.searchParams.get("token")!;
    expect((await call("/api/auth/reset-password", { json: { newPassword: "a brand new passphrase", token } })).status).toBe(200);
    await expect(signIn(person.email, PASSWORD)).rejects.toThrow();
    await expect(signIn(person.email, "a brand new passphrase")).resolves.toContain("session_token");
    // Used once: the link now lands on the expired card.
    expect(new URL((await openLink(mail!.link!)).location!).searchParams.get("error")).toBe("INVALID_TOKEN");
  });

  it("email an invite to an address without an account, and to an account only while Invites is on", async () => {
    const owner = await signUp("Sam Verhoeven");
    await confirmEmail(owner);
    const projectId = await ownedProject(owner.id);
    const stranger = `${nanoid(8).toLowerCase()}@example.test`;
    const first = await call(`/api/projects/${projectId}/invites`, { cookie: owner.cookie, json: { email: stranger, role: "viewer" } });
    expect(first.status).toBe(201);
    const invite = (await first.json()) as { code: string; emailed: boolean };
    expect(invite.emailed).toBe(true);
    const [mail] = await emailsTo(stranger);
    expect(mail?.subject).toBe("Sam Verhoeven invited you to “Website” on Todoi");
    expect(mail?.text).toContain("You'll join the project Website as a Viewer");
    expect(mail?.link).toBe(`${env.APP_URL}/i/${invite.code}`);

    const colleague = await signUp("Colleague");
    expect((await call("/api/me/prefs", { method: "PATCH", cookie: colleague.cookie, json: { emailInvites: false } })).status).toBe(200);
    const quiet = await call(`/api/projects/${projectId}/invites`, { cookie: owner.cookie, json: { email: colleague.email.toUpperCase(), role: "editor" } });
    expect(((await quiet.json()) as { emailed: boolean }).emailed).toBe(false);
    expect((await emailsTo(colleague.email)).map((m) => m.subject)).toEqual(["Confirm your email for Todoi"]);

    await call("/api/me/prefs", { method: "PATCH", cookie: colleague.cookie, json: { emailInvites: true } });
    const loud = await call(`/api/projects/${projectId}/invites`, { cookie: owner.cookie, json: { email: colleague.email, role: "editor" } });
    expect(((await loud.json()) as { emailed: boolean }).emailed).toBe(true);
    expect((await emailsTo(colleague.email)).map((m) => m.subject)).toContain("Sam Verhoeven invited you to “Website” on Todoi");

    // A link-only invite (no address) is never emailed.
    const linkOnly = await call(`/api/projects/${projectId}/invites`, { cookie: owner.cookie, json: { role: "viewer" } });
    expect(((await linkOnly.json()) as { emailed: boolean }).emailed).toBe(false);
  });
});

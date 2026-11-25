import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";

import { call, confirmEmail, signUp } from "../../../tests/integration/accounts";
import { EMAIL_UNCONFIRMED } from "../../shared/accountLinks";
import { verifyLanding } from "../auth";
import { db } from "../db";
import { groups, members, projects } from "../db/schema";
import { env } from "../env";

async function ownedProject(ownerId: string) {
  const groupId = nanoid(), projectId = nanoid();
  await db.insert(groups).values({ id: groupId, name: "Team", keyPrefix: "CE", ownerId });
  await db.insert(projects).values({ id: projectId, groupId, name: "Confirmed" });
  await db.insert(members).values({ projectId, userId: ownerId, role: "owner" });
  return projectId;
}

describe("work that relies on owning the sign-in address (R4)", () => {
  it("lets someone invite people once their address is confirmed", async () => {
    const owner = await signUp("Owner");
    const projectId = await ownedProject(owner.id);
    const refused = await call(`/api/projects/${projectId}/invites`, { cookie: owner.cookie, json: { email: "friend@example.test", role: "editor" } });
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: "forbidden", fields: { confirmEmail: EMAIL_UNCONFIRMED } });
    await confirmEmail(owner);
    expect((await call(`/api/projects/${projectId}/invites`, { cookie: owner.cookie, json: { email: "friend@example.test", role: "editor" } })).status).toBe(201);
  });

  it("keeps an invite sent to an address for that address's confirmed owner", async () => {
    const owner = await signUp("Owner");
    await confirmEmail(owner);
    const projectId = await ownedProject(owner.id);
    const teammate = `${nanoid(8).toLowerCase()}@example.test`;
    const invite = (await (await call(`/api/projects/${projectId}/invites`, { cookie: owner.cookie, json: { email: teammate, role: "editor" } })).json()) as { code: string };
    // Someone signs up with the teammate's address before the teammate does: the seat isn't theirs to take.
    const squatter = await signUp("Squatter", teammate);
    const refused = await call(`/api/invites/${invite.code}/accept`, { cookie: squatter.cookie, json: {} });
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ fields: { confirmEmail: EMAIL_UNCONFIRMED } });
    expect(await db.select().from(members).where(eq(members.userId, squatter.id))).toHaveLength(0);
    // Whoever really reads that inbox opens the link and joins.
    await confirmEmail(squatter);
    expect((await call(`/api/invites/${invite.code}/accept`, { cookie: squatter.cookie, json: {} })).status).toBe(200);
  });

  it("doesn't ask for a confirmed address to join through a link-only invite", async () => {
    const owner = await signUp("Owner");
    await confirmEmail(owner);
    const projectId = await ownedProject(owner.id);
    const invite = (await (await call(`/api/projects/${projectId}/invites`, { cookie: owner.cookie, json: { role: "viewer" } })).json()) as { code: string };
    const guest = await signUp("Link holder");
    expect((await call(`/api/invites/${invite.code}/accept`, { cookie: guest.cookie, json: {} })).status).toBe(200);
  });

  it("brings a confirmation link back to the page that asked, only within the app", () => {
    expect(verifyLanding(null)).toBe(`${env.APP_URL}/verify-email`);
    expect(verifyLanding("/verify-email?next=%2Fi%2Fabc")).toBe(`${env.APP_URL}/verify-email?next=%2Fi%2Fabc`);
    expect(verifyLanding(`${env.APP_URL}/verify-email?next=/p/x`)).toBe(`${env.APP_URL}/verify-email?next=%2Fp%2Fx`);
    for (const hostile of ["/verify-email?next=//evil.test", "/verify-email?next=https://evil.test", "/verify-email?next=/\\evil.test", "https://evil.test/x"]) {
      expect(verifyLanding(hostile)).toBe(`${env.APP_URL}/verify-email`);
    }
  });
});

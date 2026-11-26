// Invite-only sign-up (SIGN_UP=invite): no guest workspaces; new accounts only for invited addresses, an
// open invite link's visitors and SIGN_UP_EMAILS. Logging in is unaffected.
import { nanoid } from "nanoid";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { call, PASSWORD, signIn, signUp, type Person } from "../../../tests/integration/accounts";
import { db } from "../db";
import { eq } from "drizzle-orm";

import { groups, invites, items, members, projects } from "../db/schema";
import { STARTER_PLAN, STARTER_PROJECT } from "./starter";
import { env } from "../env";

const signUpAs = (email: string, callbackURL?: string) => call("/api/auth/sign-up/email", { json: { name: "Tester", email, password: PASSWORD, ...(callbackURL ? { callbackURL } : {}) } });
const fresh = () => `${nanoid(10).toLowerCase()}@example.test`;
const linkTo = (code: string) => `/verify-email?next=${encodeURIComponent(`/i/${code}`)}`;

let owner: Person;
let projectId: string;
const invite = async (values: { email?: string | null; expiresAt?: Date; revokedAt?: Date }) => {
  const code = nanoid(12);
  await db.insert(invites).values({ id: nanoid(), code, projectId, email: values.email ?? null, invitedBy: owner.id, expiresAt: values.expiresAt ?? new Date(Date.now() + 86400_000), revokedAt: values.revokedAt });
  return code;
};

beforeAll(async () => {
  owner = await signUp("Owner");
  const group = nanoid();
  projectId = nanoid();
  await db.insert(groups).values({ id: group, name: "Invites", keyPrefix: "IN", ownerId: owner.id });
  await db.insert(projects).values({ id: projectId, groupId: group, name: "Invites" });
  env.SIGN_UP = "invite";
  env.SIGN_UP_EMAILS = ["tester@example.test"];
});
afterAll(() => {
  env.SIGN_UP = "open";
  env.SIGN_UP_EMAILS = [];
});

describe("invite-only sign-up", () => {
  it("makes no guest workspaces", async () => {
    const res = await call("/api/auth/sign-in/anonymous", { json: {} });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "INVITE_ONLY" });
  });

  it("refuses an address nobody invited, and lets existing accounts log in", async () => {
    const res = await signUpAs(fresh());
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "INVITE_ONLY" });
    expect(await signIn(owner.email)).toContain("session_token");
  });

  it("lets in SIGN_UP_EMAILS, whatever the case, with the Getting started project instead of a guest workspace", async () => {
    const res = await signUpAs("Tester@Example.test");
    expect(res.status).toBe(200);
    const { user } = (await res.json()) as { user: { id: string } };
    const owned = await db.select({ id: projects.id, name: projects.name }).from(members).innerJoin(projects, eq(projects.id, members.projectId)).where(eq(members.userId, user.id));
    expect(owned.map((p) => p.name)).toEqual([STARTER_PROJECT]);
    const starterItems = STARTER_PLAN.lists.reduce((n, l) => n + l.items.reduce((m, item) => m + 1 + item.subitems.length, 0), 0);
    expect(await db.$count(items, eq(items.projectId, owned[0]!.id))).toBe(starterItems);
  });

  it("lets in an address with an open invite, not a used, revoked or expired one", async () => {
    const invited = fresh();
    await invite({ email: invited.toUpperCase() });
    expect((await signUpAs(invited)).status).toBe(200);
    const revoked = fresh();
    await invite({ email: revoked, revokedAt: new Date() });
    expect((await signUpAs(revoked)).status).toBe(403);
    const expired = fresh();
    await invite({ email: expired, expiresAt: new Date(Date.now() - 1000) });
    expect((await signUpAs(expired)).status).toBe(403);
  });

  it("lets in whoever signs up from an open invite link, unless it is locked to another address", async () => {
    const open = await invite({});
    expect((await signUpAs(fresh(), linkTo(open))).status).toBe(200);
    const locked = await invite({ email: fresh() });
    expect((await signUpAs(fresh(), linkTo(locked))).status).toBe(403);
    expect((await signUpAs(fresh(), linkTo("not-a-real-code"))).status).toBe(403);
  });
});

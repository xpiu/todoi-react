import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";

import { call, confirmIt, emailsTo, openLink, PASSWORD, signIn, signUp } from "../../../tests/integration/accounts";
import { db } from "../db";
import { users } from "../db/schema";
import { env } from "../env";

const fresh = () => `${nanoid(10).toLowerCase()}@example.test`;
const me = async (cookie: string) => (await (await call("/api/me", { cookie })).json()) as { email: string; emailVerified: boolean; pendingEmail: string | null };
const target = (location: string | null) => {
  const url = new URL(location!);
  return { page: `${url.origin}${url.pathname}`, email: url.searchParams.get("email"), error: url.searchParams.get("error") };
};

describe("changing the sign-in email", () => {
  it("needs sudo mode and a different address; the browser can't call Better Auth's endpoint directly", async () => {
    const person = await signUp("Flo");
    const same = await call("/api/me/email-change", { cookie: person.cookie, json: { email: person.email.toUpperCase() } });
    expect(await same.json()).toMatchObject({ fields: { email: "That's already your email." } });
    // A log-in alone isn't sudo mode: confirm it's you first (services/sudo.ts).
    const stale = await call("/api/me/email-change", { cookie: person.cookie, json: { email: fresh() } });
    expect(stale.status).toBe(403);
    expect(await stale.json()).toMatchObject({ fields: { sudo: "SUDO_REQUIRED" } });
    expect((await call("/api/me/sudo", { cookie: person.cookie, json: { password: PASSWORD } })).status).toBe(200);
    expect((await call("/api/me/email-change", { cookie: person.cookie, json: { email: fresh() } })).status).toBe(200);
    expect((await call("/api/auth/change-email", { cookie: person.cookie, json: { newEmail: fresh() } })).status).toBe(404);
    const guest = await call("/api/me/email-change", { json: { email: fresh() } });
    expect(guest.status).toBe(401);
  });

  it("emails the new address only, waits for the link, then switches the login and confirms the address", async () => {
    const person = await signUp("Flo");
    await confirmIt(person.cookie);
    const next = fresh();
    const asked = await call("/api/me/email-change", { cookie: person.cookie, json: { email: next } });
    expect(asked.status).toBe(200);
    expect(await asked.json()).toEqual({ pendingEmail: next });
    expect(await me(person.cookie)).toMatchObject({ email: person.email, pendingEmail: next });
    expect((await emailsTo(person.email)).map((m) => m.subject)).toEqual(["Confirm your email for todoi"]);
    const [mail] = await emailsTo(next);
    expect(mail?.subject).toBe("Confirm your new email for todoi");
    expect(mail?.text).toContain(`Until you confirm, you log in with ${person.email}.`);

    const opened = await openLink(mail!.link!);
    expect(opened.status).toBe(302);
    expect(target(opened.location)).toEqual({ page: `${env.APP_URL}/confirm-email`, email: next, error: null });
    const [row] = await db.select().from(users).where(eq(users.id, person.id));
    expect(row).toMatchObject({ email: next, emailVerified: true });
    const cookie = await signIn(next);
    expect(await me(cookie)).toMatchObject({ email: next, pendingEmail: null });
    await expect(signIn(person.email)).rejects.toThrow();

    // The same link again: already used.
    expect(target((await openLink(mail!.link!)).location)).toMatchObject({ email: next, error: "INVALID_TOKEN" });
  });

  it("sends the link again on request, and a cancelled change's link stops working", async () => {
    const person = await signUp("Sam");
    await confirmIt(person.cookie);
    const next = fresh();
    await call("/api/me/email-change", { cookie: person.cookie, json: { email: next } });
    expect((await call("/api/me/email-change/resend", { cookie: person.cookie, method: "POST" })).status).toBe(200);
    const links = (await emailsTo(next)).map((m) => m.link);
    expect(links).toHaveLength(2);
    expect((await call("/api/me/email-change", { cookie: person.cookie, method: "DELETE" })).status).toBe(204);
    expect(await me(person.cookie)).toMatchObject({ pendingEmail: null });
    expect(target((await openLink(links[1]!)).location)).toMatchObject({ page: `${env.APP_URL}/confirm-email`, error: "CHANGE_CANCELLED" });
    expect((await db.select({ email: users.email }).from(users).where(eq(users.id, person.id)))[0]!.email).toBe(person.email);
    expect((await call("/api/me/email-change/resend", { cookie: person.cookie, method: "POST" })).status).toBe(409);
  });

  it("refuses a link for an address another account took in the meantime", async () => {
    const person = await signUp("Flo");
    await confirmIt(person.cookie);
    const next = fresh();
    await call("/api/me/email-change", { cookie: person.cookie, json: { email: next } });
    await signUp("Someone else", next);
    const link = (await emailsTo(next)).find((m) => m.subject === "Confirm your new email for todoi")!.link!;
    expect(target((await openLink(link)).location)).toMatchObject({ error: "EMAIL_TAKEN" });
    expect((await db.select({ email: users.email }).from(users).where(eq(users.id, person.id)))[0]!.email).toBe(person.email);
  });
});

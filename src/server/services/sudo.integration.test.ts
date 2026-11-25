// Sudo mode (services/sudo.ts, decision Q6): deleting the account, changing the email and adding or removing
// a passkey need a log-in or a confirmation (password or passkey) in this session within the last 2 hours.
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";

import { call, cookiesFrom, PASSWORD, signIn, signUp, type Person } from "../../../tests/integration/accounts";
import { db } from "../db";
import { passkeys, sessions, users } from "../db/schema";

const HOUR = 3600_000;
const sudo = async (cookie: string) => ((await (await call("/api/me/sudo", { cookie })).json()) as { confirmedUntil: string | null }).confirmedUntil;
/** Every session of the person (or only the one behind `cookie`) as if it logged in `hours` ago. */
async function age(p: Person, hours: number, confirmedHoursAgo?: number) {
  await db.update(sessions).set({ createdAt: new Date(Date.now() - hours * HOUR), confirmedAt: confirmedHoursAgo === undefined ? null : new Date(Date.now() - confirmedHoursAgo * HOUR) }).where(eq(sessions.userId, p.id));
}
async function storedPasskey(owner: Person) {
  const id = nanoid();
  await db.insert(passkeys).values({ id, name: "Laptop", userId: owner.id, publicKey: "pk", credentialID: nanoid(), counter: 0, deviceType: "singleDevice", backedUp: false });
  return id;
}
/** Each guarded action, as the browser asks for it. */
const guarded = (p: Person, cookie = p.cookie) => ({
  addPasskey: () => call("/api/auth/passkey/generate-register-options", { cookie }),
  removePasskey: (id: string) => call("/api/auth/passkey/delete-passkey", { cookie, json: { id } }),
  changeEmail: () => call("/api/me/email-change", { cookie, json: { email: `${nanoid(8).toLowerCase()}@example.test` } }),
  deleteAccount: () => call("/api/me/deletion", { cookie, json: { email: p.email } }),
});

describe("sudo mode", () => {
  it("covers a fresh log-in for two hours, then refuses every guarded action until the person confirms", async () => {
    const flo = await signUp("Flo");
    const until = await sudo(flo.cookie);
    expect(new Date(until!).getTime()).toBeGreaterThan(Date.now() + 1.9 * HOUR);
    expect((await guarded(flo).addPasskey()).status).toBe(200);

    // Expired: logged in 2h01 ago, never confirmed.
    await age(flo, 2.02);
    expect(await sudo(flo.cookie)).toBeNull();
    const id = await storedPasskey(flo);
    const g = guarded(flo);
    for (const res of [await g.addPasskey(), await g.removePasskey(id), await g.changeEmail(), await g.deleteAccount()]) expect(res.status).toBe(403);
    expect(await (await g.addPasskey()).json()).toMatchObject({ code: "SUDO_REQUIRED" });
    expect(await (await g.changeEmail()).json()).toMatchObject({ fields: { sudo: "SUDO_REQUIRED" } });
    expect(await db.select().from(passkeys).where(eq(passkeys.id, id))).toHaveLength(1);
    expect(await db.select().from(users).where(eq(users.id, flo.id))).toHaveLength(1);

    // A confirmation from 2h01 ago has run out too.
    await age(flo, 5, 2.02);
    expect(await sudo(flo.cookie)).toBeNull();
    expect((await g.removePasskey(id)).status).toBe(403);
  });

  it("is granted by the password, for two hours, and then allows each guarded action", async () => {
    const flo = await signUp("Flo");
    await age(flo, 3);
    const wrong = await call("/api/me/sudo", { cookie: flo.cookie, json: { password: "not the password" } });
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toMatchObject({ fields: { password: "That password isn't right." } });
    expect(await sudo(flo.cookie)).toBeNull();

    const confirmed = await call("/api/me/sudo", { cookie: flo.cookie, json: { password: PASSWORD } });
    expect(confirmed.status).toBe(200);
    const { confirmedUntil } = (await confirmed.json()) as { confirmedUntil: string };
    expect(Math.abs(new Date(confirmedUntil).getTime() - (Date.now() + 2 * HOUR))).toBeLessThan(60_000);
    const id = await storedPasskey(flo);
    const g = guarded(flo);
    expect((await g.addPasskey()).status).toBe(200);
    expect((await g.removePasskey(id)).status).toBe(200);
    expect(await db.select().from(passkeys).where(eq(passkeys.id, id))).toHaveLength(0);
    expect((await g.changeEmail()).status).toBe(200);
    expect((await g.deleteAccount()).status).toBe(204);
  });

  it("is per session: confirming on one device leaves the person's other sessions outside it", async () => {
    const flo = await signUp("Flo");
    const laptop = flo.cookie;
    const phone = await signIn(flo.email);
    await age(flo, 3);
    expect((await call("/api/me/sudo", { cookie: laptop, json: { password: PASSWORD } })).status).toBe(200);
    expect(await sudo(laptop)).not.toBeNull();
    expect(await sudo(phone)).toBeNull();
    const id = await storedPasskey(flo);
    expect((await guarded(flo, phone).removePasskey(id)).status).toBe(403);
    expect((await guarded(flo, phone).deleteAccount()).status).toBe(403);
    expect((await guarded(flo, laptop).removePasskey(id)).status).toBe(200);
    // Only the laptop's session carries the confirmation.
    const rows = await db.select({ confirmedAt: sessions.confirmedAt }).from(sessions).where(and(eq(sessions.userId, flo.id)));
    expect(rows.filter((r) => r.confirmedAt)).toHaveLength(1);
  });

  it("is never available to an API token or a guest", async () => {
    const flo = await signUp("Flo");
    const token = (await (await call("/api/me/tokens", { cookie: flo.cookie, json: { name: "CI" } })).json()) as { secret: string };
    const bearer = { authorization: `Bearer ${token.secret}` };
    expect((await call("/api/me/sudo", { headers: bearer, json: { password: PASSWORD } })).status).toBe(401);
    expect((await call("/api/me/email-change", { headers: bearer, json: { email: "x@example.test" } })).status).toBe(401);
    const guest = await call("/api/auth/sign-in/anonymous", { json: {} });
    const refused = await call("/api/me/sudo", { cookie: cookiesFrom(guest), json: { password: PASSWORD } });
    expect(await refused.json()).toMatchObject({ error: "Log in or create an account to continue" });
  });
});

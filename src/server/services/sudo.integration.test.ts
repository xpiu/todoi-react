// Sudo mode (services/sudo.ts, decisions Q6 and R1): deleting the account, changing the email and adding or
// removing a passkey need a confirmation (password or passkey) in this session within the last 2 hours. A
// log-in doesn't count. Wrong passwords at the confirm step are throttled per account (decision R2).
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { describe, expect, it, vi } from "vitest";

import { call, confirmIt, cookiesFrom, PASSWORD, signIn, signUp, type Person } from "../../../tests/integration/accounts";
import { db } from "../db";
import { passkeys, sessions, users, verifications } from "../db/schema";

const HOUR = 3600_000;
const sudo = async (cookie: string) => ((await (await call("/api/me/sudo", { cookie })).json()) as { confirmedUntil: string | null }).confirmedUntil;
/** Every session of the person as if it last confirmed `hours` ago. */
async function confirmedAgo(p: Person, hours: number) {
  await db.update(sessions).set({ confirmedAt: new Date(Date.now() - hours * HOUR) }).where(eq(sessions.userId, p.id));
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
  it("doesn't count a log-in: every guarded action is refused until the person confirms, and again after two hours", async () => {
    const flo = await signUp("Flo");
    const laptop = await signIn(flo.email);
    const id = await storedPasskey(flo);
    for (const cookie of [flo.cookie, laptop]) {
      expect(await sudo(cookie)).toBeNull();
      const g = guarded(flo, cookie);
      for (const res of [await g.addPasskey(), await g.removePasskey(id), await g.changeEmail(), await g.deleteAccount()]) expect(res.status).toBe(403);
    }
    const g = guarded(flo);
    expect(await (await g.addPasskey()).json()).toMatchObject({ code: "SUDO_REQUIRED" });
    expect(await (await g.changeEmail()).json()).toMatchObject({ fields: { sudo: "SUDO_REQUIRED" } });
    expect(await db.select().from(passkeys).where(eq(passkeys.id, id))).toHaveLength(1);
    expect(await db.select().from(users).where(eq(users.id, flo.id))).toHaveLength(1);

    await confirmIt(flo.cookie);
    expect((await g.addPasskey()).status).toBe(200);
    // A confirmation from 2h01 ago has run out.
    await confirmedAgo(flo, 2.02);
    expect(await sudo(flo.cookie)).toBeNull();
    expect((await g.removePasskey(id)).status).toBe(403);
  });

  it("is granted by the password, for two hours, and then allows each guarded action", async () => {
    const flo = await signUp("Flo");
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

  describe("wrong passwords", () => {
    const tryPassword = (cookie: string, password: string) => call("/api/me/sudo", { cookie, json: { password } });
    const triesOf = (p: Person) => eq(verifications.identifier, `sudo-tries:${p.id}`);
    const quiet = () => vi.spyOn(console, "warn").mockImplementation(() => undefined);

    it("are throttled after five in 15 minutes: the sixth is refused with the wait, even the right password, and each one is logged", async () => {
      const flo = await signUp("Flo");
      const phone = await signIn(flo.email);
      const warn = quiet();
      try {
        for (let i = 0; i < 5; i++) expect((await tryPassword(i % 2 ? phone : flo.cookie, `guess ${i}`)).status).toBe(400);
        const lines = warn.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
        expect(lines).toHaveLength(5);
        for (const [i, line] of lines.entries()) expect(line).toMatchObject({ level: "warn", path: "/api/me/sudo", status: 400, user: flo.id, event: "sudo-confirm-wrong-password", try: i + 1, of: 5 });
        expect(warn.mock.calls.join("\n")).not.toContain("guess");

        // Per account, not per session: the other device is refused too.
        for (const cookie of [flo.cookie, phone]) {
          const refused = await tryPassword(cookie, PASSWORD);
          expect(refused.status).toBe(429);
          expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(14 * 60);
          expect(await refused.json()).toMatchObject({ code: "rate_limited", error: "Too many tries. Try again in 15 minutes.", fields: { password: "Too many tries. Try again in 15 minutes." } });
        }
        expect(await sudo(flo.cookie)).toBeNull();
        expect(String(warn.mock.calls.at(-1)?.[0])).toContain(`"user":"${flo.id}"`);
      } finally {
        warn.mockRestore();
      }
      // No lockout: the account still logs in.
      expect(await signIn(flo.email)).toBeTruthy();

      // The window ends: the right password works again.
      await db.update(verifications).set({ expiresAt: new Date(Date.now() - 1000) }).where(triesOf(flo));
      expect((await tryPassword(flo.cookie, PASSWORD)).status).toBe(200);
      expect(await sudo(flo.cookie)).not.toBeNull();
    });

    it("start again after the right password, and are counted per account", async () => {
      const flo = await signUp("Flo"), sam = await signUp("Sam");
      const warn = quiet();
      try {
        for (let i = 0; i < 4; i++) expect((await tryPassword(flo.cookie, "nope")).status).toBe(400);
        expect((await tryPassword(flo.cookie, PASSWORD)).status).toBe(200);
        expect(await db.select().from(verifications).where(triesOf(flo))).toEqual([]);
        for (let i = 0; i < 5; i++) expect((await tryPassword(flo.cookie, "nope")).status).toBe(400);
        expect((await tryPassword(flo.cookie, PASSWORD)).status).toBe(429);
        // Sam's tries are his own.
        expect((await tryPassword(sam.cookie, PASSWORD)).status).toBe(200);
        // Under a minute left in the window: "1 minute".
        await db.update(verifications).set({ expiresAt: new Date(Date.now() + 50_000) }).where(triesOf(flo));
        expect(await (await tryPassword(flo.cookie, PASSWORD)).json()).toMatchObject({ error: "Too many tries. Try again in 1 minute." });
      } finally {
        warn.mockRestore();
      }
    });

    it("can't be raced past the limit by guesses sent at once", async () => {
      const flo = await signUp("Flo");
      const warn = quiet();
      try {
        const statuses = (await Promise.all(Array.from({ length: 12 }, (_, i) => tryPassword(flo.cookie, `guess ${i}`)))).map((r) => r.status);
        expect(statuses.filter((s) => s === 400)).toHaveLength(5);
        expect(statuses.filter((s) => s === 429)).toHaveLength(7);
      } finally {
        warn.mockRestore();
      }
    });
  });
});

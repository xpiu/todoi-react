import { describe, expect, it } from "vitest";

import { call, emailsTo, openLink, PASSWORD, signUp } from "../../../tests/integration/accounts";
import { SIGN_IN_TRIES } from "../auth";
import { clearAttempts, reserveAttempt } from "./attempts";

const logIn = (email: string, password: string) => call("/api/auth/sign-in/email", { json: { email, password } });

describe("attempts counted per subject", () => {
  it("count up to the limit, then say when to try again, and start again once cleared", async () => {
    const rule = { max: 2, windowMinutes: 15 };
    const now = new Date("2026-11-26T10:00:00Z");
    expect(await reserveAttempt("test:a", rule, now)).toEqual({ try: 1 });
    expect(await reserveAttempt("test:a", rule, now)).toEqual({ try: 2 });
    expect(await reserveAttempt("test:a", rule, now)).toEqual({ retryAt: new Date("2026-11-26T10:15:00Z") });
    // A new window after the old one ends.
    expect(await reserveAttempt("test:a", rule, new Date("2026-11-26T10:15:01Z"))).toEqual({ try: 1 });
    await clearAttempts("test:a");
    expect(await reserveAttempt("test:a", rule, now)).toEqual({ try: 1 });
  });

  it("parallel attempts can't get past the limit", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => reserveAttempt("test:parallel", { max: 3, windowMinutes: 15 })));
    expect(results.filter((r) => "try" in r)).toHaveLength(3);
  });
});

describe("log-ins per account (R3)", () => {
  it("throttle an account after too many tries, even for the right password; any address, same answer", async () => {
    const person = await signUp("Throttled");
    for (let i = 0; i < SIGN_IN_TRIES.max; i++) expect((await logIn(person.email, "not the password")).status).toBe(401);
    const refused = await logIn(person.email.toUpperCase(), PASSWORD);
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(((await refused.json()) as { message: string }).message).toMatch(/Too many log-in attempts for this account\. Try again in 15 minutes\./);
    // An address without an account answers the same way, so the limit doesn't reveal which addresses exist.
    const stranger = "nobody-here@example.test";
    for (let i = 0; i < SIGN_IN_TRIES.max; i++) expect((await logIn(stranger, "guess")).status).toBe(401);
    expect((await logIn(stranger, "guess")).status).toBe(429);
  });

  it("start again after a log-in that works, and after a password reset", async () => {
    const person = await signUp("Forgetful");
    for (let i = 0; i < SIGN_IN_TRIES.max - 1; i++) await logIn(person.email, "wrong");
    expect((await logIn(person.email, PASSWORD)).status).toBe(200);
    for (let i = 0; i < SIGN_IN_TRIES.max - 1; i++) expect((await logIn(person.email, "wrong")).status).toBe(401);
    expect((await logIn(person.email, "wrong")).status).toBe(401);
    expect((await logIn(person.email, PASSWORD)).status).toBe(429);

    // The reset link proves the address: the new password logs in at once.
    await call("/api/auth/request-password-reset", { json: { email: person.email, redirectTo: "/reset" } });
    const mail = (await emailsTo(person.email)).find((m) => m.subject === "Reset your todoi password")!;
    const token = new URL((await openLink(mail.link!)).location!).searchParams.get("token")!;
    expect((await call("/api/auth/reset-password", { json: { newPassword: "a fresh passphrase", token } })).status).toBe(200);
    expect((await logIn(person.email, "a fresh passphrase")).status).toBe(200);
  });
});

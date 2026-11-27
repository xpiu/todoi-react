// Passkeys through Better Auth's passkey plugin (auth.ts): who may add one, the relying party it is made
// for, and the list Settings › Account › Passkeys shows. The browser ceremony itself is covered end to end
// with Chromium's virtual authenticator (tests/e2e/passkeys.spec.ts).
import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";

import { call, confirmIt, cookiesFrom, signUp, type Person } from "../../../tests/integration/accounts";
import { db } from "../db";
import { passkeys } from "../db/schema";
import { env } from "../env";

/** A stored passkey row, as the plugin writes one after a registration. */
async function storedPasskey(owner: Person, name: string) {
  const id = nanoid();
  await db.insert(passkeys).values({ id, name, userId: owner.id, publicKey: "pk", credentialID: nanoid(), counter: 0, deviceType: "singleDevice", backedUp: false, transports: "internal" });
  return id;
}

describe("passkeys", () => {
  it("are offered to registered accounts for the app's own address, never to guests", async () => {
    const flo = await signUp("Flo");
    await confirmIt(flo.cookie);
    const options = await call("/api/auth/passkey/generate-register-options", { cookie: flo.cookie });
    expect(options.status).toBe(200);
    expect(await options.json()).toMatchObject({ rp: { id: new URL(env.APP_URL).hostname, name: "todoi" }, user: { name: flo.email } });
    const guest = await call("/api/auth/sign-in/anonymous", { json: {} });
    const refused = await call("/api/auth/passkey/generate-register-options", { cookie: cookiesFrom(guest) });
    expect(refused.status).toBe(403);
    expect((await call("/api/auth/passkey/generate-register-options")).status).toBe(401);
  });

  it("lists the account's own passkeys with when each was last used, and only its owner renames one", async () => {
    const flo = await signUp("Flo"), sam = await signUp("Sam");
    const id = await storedPasskey(flo, "Chrome on macOS");
    await storedPasskey(sam, "Sam's phone");
    const list = (await (await call("/api/auth/passkey/list-user-passkeys", { cookie: flo.cookie })).json()) as Array<{ id: string; name: string; lastUsedAt: string | null }>;
    expect(list).toEqual([expect.objectContaining({ id, name: "Chrome on macOS", lastUsedAt: null })]);
    expect((await call("/api/auth/passkey/update-passkey", { cookie: sam.cookie, json: { id, name: "Mine now" } })).status).toBe(401);
    const renamed = await call("/api/auth/passkey/update-passkey", { cookie: flo.cookie, json: { id, name: "Work laptop" } });
    expect(await renamed.json()).toMatchObject({ passkey: { id, name: "Work laptop" } });
  });
});

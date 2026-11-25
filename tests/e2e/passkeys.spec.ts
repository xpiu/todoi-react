// Passkeys end to end with Chromium's virtual authenticator (CDP WebAuthn: ctap2, internal, resident keys,
// user verification): add one in Settings › Account, log out, log back in with it — through the email
// field's autofill (conditional mediation) and through the button — rename it, then the sudo-mode confirm
// step: adding and removing it and deleting the account ask "Confirm it's you" (a passkey, or the password).
// A log-in never counts as that confirmation, a passkey log-in included. Every account here is a fresh
// sign-up that trackAccounts removes.
import { expect, test, type Page } from "@playwright/test";
import { nanoid } from "nanoid";

import { checkA11y, confirmWithPassword, trackAccounts, useScope } from "./helpers";

trackAccounts(test);
const PASSWORD = "passkeys-e2e-password";

async function signUp(page: Page) {
  const email = `passkey-${nanoid(10).toLowerCase()}@example.test`;
  const r = await page.request.post("/api/auth/sign-up/email", { data: { name: "Passkey test", email, password: PASSWORD } });
  expect(r.ok(), "sign-up").toBeTruthy();
  return { email };
}

/** A platform authenticator with user verification that answers every prompt by itself. */
async function virtualAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  return { credentials: async () => (await cdp.send("WebAuthn.getCredentials", { authenticatorId })).credentials };
}

/** Log out in this browser: its session cookie goes (the app's own Log out also ends the session server-side). */
async function logOut(page: Page) {
  await page.context().clearCookies();
}
const signedInAs = async (page: Page) => ((await (await page.request.get("/api/me")).json()) as { email?: string }).email;
/** Until when this browser's session is in sudo mode, or null. */
const sudoUntil = async (page: Page) => ((await (await page.request.get("/api/me/sudo")).json()) as { confirmedUntil: string | null }).confirmedUntil;

test("passkeys: add one, log in with it by autofill and by the button, rename, remove after confirming it's you", async ({ page }) => {
  test.slow();
  await useScope(page, "rounded-light");
  const authenticator = await virtualAuthenticator(page);
  const { email } = await signUp(page);

  // Add: the sign-up's log-in isn't a confirmation, so confirm it's you first (the password: no passkey yet).
  await page.goto("/account?s=signin");
  await expect(page.getByText("None yet · Log in with your fingerprint, face or screen lock")).toBeVisible();
  await page.getByRole("button", { name: "Manage" }).click();
  const dialog = page.getByRole("dialog", { name: "Passkeys" });
  await expect(dialog.getByText("No passkeys yet")).toBeVisible();
  await dialog.getByRole("button", { name: "Add a passkey" }).click();
  await expect(page.getByRole("dialog", { name: "Confirm it's you" }).getByLabel(/^Password/)).toBeFocused();
  await expect(page.getByRole("dialog", { name: "Confirm it's you" }).getByRole("button", { name: "Use a passkey" })).toHaveCount(0);
  await confirmWithPassword(page, PASSWORD);
  await expect(page.getByText(/^Added the passkey “.+”$/)).toBeVisible();
  const row = dialog.getByRole("listitem");
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(/Added .+ · Never used/);
  expect(await authenticator.credentials()).toHaveLength(1);
  await checkA11y(page, "passkeys dialog");
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("1 passkey · Log in with your fingerprint, face or screen lock")).toBeVisible();

  // Log in through the email field's autofill: the virtual authenticator answers the conditional request.
  await logOut(page);
  await page.goto("/login");
  await expect(page.getByLabel("Email")).toHaveAttribute("autocomplete", "username webauthn");
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
  expect(await signedInAs(page)).toBe(email);
  // A passkey log-in is a log-in, not a confirmation.
  expect(await sudoUntil(page)).toBeNull();

  // Log in with the button, in a browser that offers no passkey autofill.
  await logOut(page);
  await page.addInitScript(() => {
    PublicKeyCredential.isConditionalMediationAvailable = async () => false;
  });
  await page.goto("/login");
  await checkA11y(page, "log in with a passkey");
  await page.getByRole("button", { name: "Log in with a passkey" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
  expect(await signedInAs(page)).toBe(email);
  expect(await sudoUntil(page)).toBeNull();

  // Rename in place; "Last used" shows the log-ins.
  await page.goto("/account?s=signin");
  await page.getByRole("button", { name: "Manage" }).click();
  await expect(row).toContainText("Last used");
  await dialog.getByRole("button", { name: /^Rename / }).click();
  await dialog.getByLabel("Passkey name").fill("Work laptop");
  await dialog.getByLabel("Passkey name").press("Enter");
  await expect(dialog.getByText("Work laptop")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Rename Work laptop" })).toBeFocused();

  // Remove: the passkey log-in didn't confirm anything, so confirm it's you — here with the passkey itself.
  const sessions = async () => (await (await page.request.get("/api/auth/list-sessions")).json()) as Array<{ token: string }>;
  const before = await sessions();
  const { session: current } = (await (await page.request.get("/api/auth/get-session")).json()) as { session: { token: string } };
  await dialog.getByRole("button", { name: "Remove Work laptop" }).click();
  await dialog.getByRole("button", { name: "Remove", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "Confirm it's you" });
  await expect(confirm.getByText("To remove a passkey, enter your password.", { exact: false })).toBeVisible();
  await checkA11y(page, "confirm it's you");
  await confirm.getByRole("button", { name: "Use a passkey" }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByText("Removed the passkey “Work laptop”")).toBeVisible();
  await expect(dialog.getByText("No passkeys yet")).toBeVisible();
  // The passkey confirmation replaced this browser's session (one in, one out), and the new one is in sudo mode.
  expect(await signedInAs(page)).toBe(email);
  expect(await sudoUntil(page)).not.toBeNull();
  const after = await sessions();
  expect(after).toHaveLength(before.length);
  expect(after.map((s) => s.token)).not.toContain(current.token);
});

test("deleting the account asks to confirm it's you with the password first, right after logging in too", async ({ page }) => {
  await useScope(page, "minimal-dark");
  const { email } = await signUp(page);
  await page.goto("/account?s=data");
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Delete account" });
  await dialog.getByRole("button", { name: "Continue" }).click();
  await dialog.getByLabel("Account email").fill(email);
  await dialog.getByRole("button", { name: "Delete account" }).click();
  const confirm = page.getByRole("dialog", { name: "Confirm it's you" });
  await expect(confirm.getByLabel(/^Password/)).toBeFocused();
  // No passkey on this account: the password only.
  await expect(confirm.getByRole("button", { name: "Use a passkey" })).toHaveCount(0);
  // Esc closes the confirm step only; the typed address stays.
  await page.keyboard.press("Escape");
  await expect(confirm).toBeHidden();
  await expect(dialog.getByLabel("Account email")).toHaveValue(email);
  await dialog.getByRole("button", { name: "Delete account" }).click();
  await confirm.getByLabel(/^Password/).fill("not my password");
  await confirm.getByLabel(/^Password/).press("Enter");
  await expect(confirm.getByText("That password isn't right.")).toBeVisible();
  await confirm.getByLabel(/^Password/).fill(PASSWORD);
  await confirm.getByRole("button", { name: "Confirm" }).click();
  await expect(page).toHaveURL(/\/account-deleted/);
  await expect(page.getByRole("heading", { name: "Your account is deleted" })).toBeVisible();
});

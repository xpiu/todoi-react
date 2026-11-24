// Account emails end to end through the development transport (EMAIL_DIR): reset a password, change the
// sign-in email, the Email notifications switches, and deleting an account. Every account here is a fresh
// sign-up that trackAccounts removes afterwards (the deleted one is already gone).
import { expect, test, type Page } from "@playwright/test";
import { nanoid } from "nanoid";

import { checkA11y, emailTo, freshProject, trackAccounts, useScope } from "./helpers";

trackAccounts(test);
const PASSWORD = "account-email-password";

async function signUp(page: Page, name = "Email test") {
  const email = `email-${nanoid(10).toLowerCase()}@example.test`;
  const r = await page.request.post("/api/auth/sign-up/email", { data: { name, email, password: PASSWORD } });
  expect(r.ok(), "sign-up").toBeTruthy();
  return { email, id: ((await r.json()) as { user: { id: string } }).user.id };
}

test("reset a forgotten password through the emailed link", async ({ page }) => {
  await useScope(page, "minimal-light");
  const { email } = await signUp(page, "Reset test");
  await page.context().clearCookies();
  await page.goto(`/login?email=${encodeURIComponent(email)}`);
  await page.getByRole("button", { name: "Forgot?" }).click();
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
  const mail = await emailTo(email, "Reset your Todoi password");
  expect(mail.text).toContain("The link works once and expires in 1 hour.");
  await page.goto(mail.link);
  await expect(page.getByRole("heading", { name: "Set a new password" })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  await checkA11y(page, "reset new password");
  await page.getByLabel(/^New password/).fill("a brand new passphrase");
  await page.getByRole("button", { name: "Save password and log in" }).click();
  await expect(page.getByRole("heading", { name: "Password updated" })).toBeVisible();
  expect(((await (await page.request.get("/api/me")).json()) as { email: string }).email).toBe(email);
  // The link worked once.
  await page.goto(mail.link);
  await expect(page.getByRole("heading", { name: "This reset link has expired" })).toBeVisible();
});

test("change the sign-in email: password, link to the new address, confirmed", async ({ page }) => {
  await useScope(page, "rounded-light");
  const { email } = await signUp(page, "Change test");
  const next = `new-${nanoid(8).toLowerCase()}@example.test`;
  await page.goto("/account?s=signin");
  await page.getByRole("button", { name: "Change email" }).click();
  const dialog = page.getByRole("dialog", { name: "Change email" });
  await expect(dialog.getByLabel("New email")).toBeFocused();
  await dialog.getByLabel("New email").fill(next);
  await dialog.getByLabel(/^Current password/).fill("not my password");
  await dialog.getByRole("button", { name: "Send confirmation link" }).click();
  await expect(dialog.getByText("That password isn't right.")).toBeVisible();
  await dialog.getByLabel(/^Current password/).fill(PASSWORD);
  await dialog.getByLabel(/^Current password/).press("Enter");
  await expect(dialog.getByText("Check your inbox")).toBeVisible();
  await checkA11y(page, "change email sent");
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText(`${email} · Waiting for you to confirm ${next}`)).toBeVisible();

  const mail = await emailTo(next, "Confirm your new email for Todoi");
  expect(mail.text).toContain(`Until you confirm, you log in with ${email}.`);
  await page.goto(mail.link);
  await expect(page.getByRole("heading", { name: "Email changed" })).toBeVisible();
  await expect(page.getByText(next)).toBeVisible();
  await checkA11y(page, "email changed");
  await page.goto("/account?s=signin");
  await expect(page.getByText(`${next} · Verified`)).toBeVisible();
  await page.goto(mail.link);
  await expect(page.getByRole("heading", { name: "This link was already used" })).toBeVisible();
});

test("confirm the address, then the Email notifications switches save to the account", async ({ page }) => {
  await useScope(page, "minimal-dark");
  const { email } = await signUp(page, "Switches test");
  await page.goto("/settings?s=notifications");
  const group = page.getByRole("region", { name: "Email notifications" });
  await expect(group.getByRole("switch", { name: "Email me about invites" })).toBeDisabled();
  await group.getByRole("button", { name: "Send confirmation" }).click();
  await expect(group.getByText(`Sent. Open the link in the email to ${email}`)).toBeVisible();
  const mail = await emailTo(email, "Confirm your email for Todoi");
  await page.goto(mail.link);
  await expect(page.getByRole("heading", { name: "Email confirmed" })).toBeVisible();
  await page.goto("/settings?s=notifications");
  const comments = group.getByRole("switch", { name: "Email me about comments" });
  await expect(comments).toBeEnabled();
  await expect(comments).toHaveAttribute("aria-checked", "false");
  await comments.click();
  await expect.poll(async () => ((await (await page.request.get("/api/me")).json()) as { prefs: { emailComments: boolean } }).prefs.emailComments).toBe(true);
  await checkA11y(page, "email notifications");
  await page.reload();
  await expect(group.getByRole("switch", { name: "Email me about comments" })).toHaveAttribute("aria-checked", "true");
});

test("delete an account: review, typed email, signed out on the deleted page", async ({ page }) => {
  await useScope(page, "rounded-dark");
  const { email, id } = await signUp(page, "Delete test");
  const groupId = nanoid();
  expect((await page.request.post("/api/groups", { data: { id: groupId, name: "Going away", keyPrefix: "GA" } })).status()).toBe(201);
  const f = await freshProject(page, "Doomed", { groupId });
  await f.item("Last item");
  await page.goto("/account?s=data");
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Delete account" });
  await expect(dialog.getByRole("button", { name: "Keep my account" })).toBeFocused();
  await expect(dialog.getByText(/Doomed/)).toBeVisible();
  await expect(dialog.getByText("1 project group you own")).toBeVisible();
  await checkA11y(page, "delete account review");
  await dialog.getByRole("button", { name: "Continue" }).click();
  const field = dialog.getByLabel("Account email");
  await expect(field).toBeFocused();
  const remove = dialog.getByRole("button", { name: "Delete account" });
  await expect(remove).toBeDisabled();
  await field.fill(email.toUpperCase());
  await remove.click();
  await expect(page).toHaveURL(/\/account-deleted/);
  await expect(page.getByRole("heading", { name: "Your account is deleted" })).toBeVisible();
  await checkA11y(page, "account deleted");
  expect((await page.request.get("/api/me")).status()).toBe(401);
  expect((await page.request.get(`/api/projects/${f.projectId}`)).status()).toBe(404);
  const signIn = await page.request.post("/api/auth/sign-in/email", { data: { email, password: PASSWORD } });
  expect(signIn.ok()).toBeFalsy();
  void id;
});

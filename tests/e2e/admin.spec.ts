// The operator console: the seeded account is an operator in development (ADMIN_EMAILS defaults to it).
// An error thrown in the browser is reported, grouped and shown with its stack, and can be resolved;
// someone who isn't an operator gets a plain refusal and no link to the console.
import { expect, test } from "@playwright/test";
import { nanoid } from "nanoid";

import { signIn, trackAccounts, useScope, type Scope } from "./helpers";

trackAccounts(test);

for (const scope of ["rounded-light", "minimal-dark"] as Scope[]) {
  test(`shows Todoi's health to an operator and records a browser error in ${scope}`, async ({ page }) => {
    await useScope(page, scope);
    await signIn(page);
    await page.goto("/account?s=support");
    await page.locator(".td-settings-row").filter({ hasText: "Operator console" }).getByRole("button", { name: "Open" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "Operator console" })).toBeVisible();
    await expect(page.getByText(/^\d[\d,]* accounts$/)).toBeVisible();

    // A bug in the browser: reported once, grouped by kind and message.
    const marker = `E2E console check ${scope} ${nanoid(6)}`;
    await page.evaluate((m) => setTimeout(() => { throw new RangeError(m); }), marker);
    await expect.poll(async () => ((await (await page.request.get("/api/admin/overview")).json()) as { errors: Array<{ message: string }> }).errors.some((e) => e.message === marker)).toBe(true);
    await page.reload();
    const row = page.locator(".td-settings-row").filter({ hasText: marker });
    await expect(row).toContainText("RangeError");
    await expect(row).toContainText("Browser · /admin · 1×");
    await row.getByRole("button", { name: "Show the stack" }).click();
    await expect(page.locator(".td-admin-stack").first()).toContainText("RangeError");
    await page.waitForTimeout(300);
    await page.screenshot({ path: `.tmp/shots/admin-${scope}.png` });
    await row.getByRole("button", { name: "Resolve" }).click();
    await expect(row).toContainText("Resolved");
  });
}

test("refuses someone who isn't an operator, and doesn't show them the way in", async ({ page }) => {
  expect((await page.request.post("/api/auth/sign-up/email", { data: { name: "Not an operator", email: `admin-${nanoid(8).toLowerCase()}@example.test`, password: "admin-test-password" } })).ok()).toBeTruthy();
  await page.goto("/admin");
  await expect(page.getByText("Only Todoi's operators can open this page")).toBeVisible();
  await page.goto("/account?s=support");
  await expect(page.getByText("Documentation")).toBeVisible();
  await expect(page.getByText("Operator console")).toHaveCount(0);
});

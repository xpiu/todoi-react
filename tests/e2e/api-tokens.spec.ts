// Account › API tokens (work plan R5): a token limited to one project, read and write. It works there,
// is refused elsewhere, says what it can do in the list, and is revoked at the end.
import { expect, test } from "@playwright/test";
import { nanoid } from "nanoid";

import { seedProjectId, signIn, useScope, type Scope } from "./helpers";

for (const scope of ["rounded-light", "minimal-dark"] as Scope[]) {
  test(`makes a token for one project in ${scope}`, async ({ page }) => {
    await useScope(page, scope);
    await signIn(page);
    const projectId = await seedProjectId(page);
    const name = `E2E agent ${nanoid(6)}`;
    await page.goto("/account?s=tokens");
    await page.getByRole("textbox", { name: "Token name" }).fill(name);
    await page.getByRole("combobox", { name: "Access" }).click();
    await page.getByRole("option", { name: "Read and write" }).click();
    await page.getByRole("combobox", { name: "Projects" }).click();
    await page.getByRole("option", { name: "Only the projects I pick" }).click();
    await expect(page.getByRole("button", { name: "Create token" })).toBeDisabled();
    await page.getByRole("button", { name: "Choose projects" }).click();
    await page.getByRole("menuitemcheckbox", { name: "Helicopters Europe website" }).click();
    await expect(page.getByRole("menuitemcheckbox", { name: "Helicopters Europe website" })).toHaveAttribute("aria-checked", "true");
    await page.waitForTimeout(300);
    await page.screenshot({ path: `.tmp/shots/api-tokens-pick-${scope}.png` });
    await page.keyboard.press("Escape");
    await expect(page.getByText("1 project", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Create token" }).click();

    const secret = (await page.locator(".td-settings-row").filter({ hasText: "Copy it once" }).locator(".td-settings-rowlabel[data-mono]").textContent())?.trim() ?? "";
    expect(secret).toMatch(/^tdi_/);
    const row = page.locator(".td-settings-row").filter({ hasText: name });
    await expect(row).toContainText("Read and write · Helicopters Europe website");
    await page.screenshot({ path: `.tmp/shots/api-tokens-${scope}.png` });

    // The token works in its project and nowhere else (the bearer answers before the page's session cookie).
    const bearer = { Authorization: `Bearer ${secret}` };
    const api = page.request;
    expect((await api.get(`/api/projects/${projectId}`, { headers: bearer })).status()).toBe(200);
    expect((await api.get("/api/inbox/unread", { headers: bearer })).status()).toBe(403);

    await row.getByRole("button", { name: "Revoke" }).click();
    await expect(row).toContainText("Revoked");
  });
}

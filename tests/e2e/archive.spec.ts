// Export everything and restore it in the browser: one account exports a .zip, a second account
// restores it through Settings › Storage & sync › Restore from an export, reviews it, and gets the
// project back with its items and comments.
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { nanoid } from "nanoid";

import { trackAccounts, useScope, type Scope } from "./helpers";

trackAccounts(test);

async function signUp(page: Page, name: string) {
  const email = `archive-${nanoid(8).toLowerCase()}@example.test`;
  expect((await page.request.post("/api/auth/sign-up/email", { data: { name, email, password: "archive-test-password" } })).ok(), "sign-up").toBeTruthy();
  return email;
}

for (const scope of ["rounded-dark", "minimal-light"] as Scope[]) {
  test(`exports everything and restores it into another account in ${scope}`, async ({ page, browser }) => {
    test.setTimeout(60_000);
    await useScope(page, scope);
    await signUp(page, "Archive owner");
    const groupId = nanoid();
    expect((await page.request.post("/api/groups", { data: { id: groupId, name: "Launch", keyPrefix: "LA" } })).ok()).toBeTruthy();
    const projectId = nanoid(), name = `Archived plans ${nanoid(4)}`;
    const made = await page.request.post("/api/projects", { data: { id: projectId, groupId, name, lists: [["To-do", "TODO"], ["Done", "DONE"]] } });
    const lists = ((await made.json()) as { lists: Array<{ id: string }> }).lists;
    const itemId = nanoid();
    expect((await page.request.post("/api/items", { data: { id: itemId, title: "Draft the launch post", listId: lists[0]!.id, priority: "HIGH", dueDate: "2026-12-01" } })).status()).toBe(201);
    expect((await page.request.post(`/api/items/${itemId}/comments`, { data: { id: nanoid(), body: "First draft is in the doc" } })).ok()).toBeTruthy();

    // Export everything from Account › Data.
    await page.goto("/account?s=data");
    const saved = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export .zip" }).click();
    const download = await saved;
    expect(download.suggestedFilename()).toMatch(/^todoi-export-\d{4}-\d{2}-\d{2}\.zip$/);
    const zipPath = await download.path();
    await expect(page.getByRole("status").filter({ hasText: "Exported everything" })).toBeVisible();

    // A second account restores it.
    const other = await browser.newContext({ baseURL: "http://localhost:5173" });
    const page2 = await other.newPage();
    await useScope(page2, scope);
    await signUp(page2, "Archive restorer");
    await page2.goto("/settings?s=storage");
    await page2.getByRole("button", { name: "Restore…" }).click();
    const dialog = page2.getByRole("dialog", { name: "Restore from an export" });
    await dialog.locator('input[type="file"]').setInputFiles({ name: "todoi-export.zip", mimeType: "application/zip", buffer: await readFile(zipPath!) });
    await expect(dialog.getByText("Exported by Archive owner on", { exact: false })).toBeVisible();
    await expect(dialog.getByText(name)).toBeVisible();
    await expect(dialog.getByText(/1 item · 1 comment/)).toBeVisible();
    await page2.waitForTimeout(350);
    await page2.screenshot({ path: `.tmp/shots/archive-review-${scope}.png` });
    await dialog.getByRole("button", { name: /^Restore \d+ projects?$/ }).click();
    await expect(dialog.getByText(/^Restored \d+ projects?$/)).toBeVisible();
    await page2.screenshot({ path: `.tmp/shots/archive-done-${scope}.png` });
    await dialog.getByRole("button", { name: "Open Projects" }).click();
    await expect(page2).toHaveURL(/\/projects/);

    const restored = ((await (await page2.request.get("/api/groups")).json()) as Array<{ projects: Array<{ id: string; name: string }> }>).flatMap((g) => g.projects).find((p) => p.name === name)!;
    expect(restored.id).not.toBe(projectId);
    const items = (await (await page2.request.get(`/api/items?projectId=${restored.id}`)).json()) as Array<{ id: string; title: string; priority: string; dueDate: string }>;
    expect(items.map((i) => [i.title, i.priority, i.dueDate])).toEqual([["Draft the launch post", "HIGH", "2026-12-01"]]);
    const details = (await (await page2.request.get(`/api/items/${items[0]!.id}/details`)).json()) as { comments: Array<{ body: string }> };
    expect(details.comments.map((c) => c.body)).toEqual(["**Archive owner** · " + new Date().toISOString().slice(0, 10) + "\n\nFirst draft is in the doc"]);
    await other.close();
  });

  test(`explains a file it can't restore in ${scope}`, async ({ page }) => {
    await useScope(page, scope);
    await signUp(page, "Archive refusal");
    await page.goto("/settings?s=storage");
    await page.getByRole("button", { name: "Restore…" }).click();
    const dialog = page.getByRole("dialog", { name: "Restore from an export" });
    await dialog.locator('input[type="file"]').setInputFiles({ name: "notes.zip", mimeType: "application/zip", buffer: Buffer.from("not a zip") });
    await expect(dialog.getByText("This file isn't a todoi export. Choose the .zip file that Export everything downloaded.")).toBeVisible();
    await page.waitForTimeout(350);
    await page.screenshot({ path: `.tmp/shots/archive-refused-${scope}.png` });
  });
}

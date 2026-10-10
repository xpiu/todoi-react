import { expect, test } from "@playwright/test";

import { freshProject, SCOPES, signIn, useScope } from "./helpers";

for (const scope of SCOPES) test(`snapshot Undo names later edits in ${scope}`, async ({ page }) => {
  await useScope(page, scope);
  await signIn(page);
  const f = await freshProject(page, "Snapshot undo");
  try {
    const id = await f.item("Original title", { priority: "HIGH" });
    await page.goto(`/p/${f.projectId}?v=list`);
    const row = page.locator(`[data-drag-id="${id}"]`);
    const changePriority = async () => {
      await row.click({ modifiers: ["ControlOrMeta"] });
      await page.getByRole("toolbar", { name: /selected item/ }).getByRole("button", { name: "Priority", exact: true }).click();
      await page.getByRole("menuitem", { name: "Low", exact: true }).click();
      await expect(page.locator(".td-toast")).toContainText("Set priority Low");
      await page.keyboard.press("Escape");
    };
    await changePriority();
    // An untracked edit, also representative of a collaborator's change, remains outside the undo stack.
    expect((await page.request.patch(`/api/items/${id}`, { data: { priority: "MEDIUM", title: "Later title" } })).ok()).toBeTruthy();
    await row.focus();
    await page.keyboard.press("z");
    await expect(page.locator(".td-toast")).toContainText("also reverted later edits to priority");
    const current = async () => (await (await page.request.get(`/api/items/${id}`)).json());
    expect((await current()).priority).toBe("HIGH");
    expect((await current()).title).toBe("Later title");
    await page.screenshot({ path: `.tmp/undo/${scope}-later-edit.png` });
    await changePriority();
    expect((await page.request.patch(`/api/items/${id}`, { data: { title: "Another title" } })).ok()).toBeTruthy();
    await row.focus();
    await page.keyboard.press("z");
    await expect(page.locator(".td-toast")).toContainText("Undid: set priority");
    await expect(page.locator(".td-toast")).not.toContainText("later edits");
    expect((await current()).title).toBe("Another title");
  } finally { await f.cleanup(); }
});

test("Undo of the last repeat restores the earlier status and names a later status edit", async ({ page }) => {
  await signIn(page);
  const f = await freshProject(page, "Last repeat undo");
  try {
    const id = await f.item("Last repeat", { dueDate: "2026-10-10" });
    expect((await page.request.patch(`/api/items/${id}`, { data: { repeatRule: { freq: "daily", ends: { type: "after", count: 1 } } } })).ok()).toBeTruthy();
    await page.goto(`/p/${f.projectId}?v=list`);
    await page.locator(`[data-drag-id="${id}"]`).getByRole("checkbox", { name: "Mark done" }).click();
    await expect(page.locator(".td-toast")).toContainText("that was the last repeat");
    expect((await page.request.patch(`/api/items/${id}`, { data: { status: "DOING" } })).ok()).toBeTruthy();
    await page.locator(".td-toast").getByRole("button", { name: "Undo" }).click();
    await expect(page.locator(".td-toast")).toContainText("also reverted later edits to status");
    const item = await (await page.request.get(`/api/items/${id}`)).json();
    expect(item.status).toBe("TODO");
    expect(item.done).toBe(false);
    expect(item.repeatCount).toBe(0);
  } finally { await f.cleanup(); }
});

test("snapshot Undo includes queued edits while offline", async ({ page, context }) => {
  await signIn(page);
  const f = await freshProject(page, "Offline snapshot undo");
  try {
    const id = await f.item("Offline priority", { priority: "HIGH" });
    await page.goto(`/p/${f.projectId}?v=list`);
    const row = page.locator(`[data-drag-id="${id}"]`);
    await row.click({ modifiers: ["ControlOrMeta"] });
    await page.getByRole("toolbar", { name: /selected item/ }).getByRole("button", { name: "Priority", exact: true }).click();
    await page.getByRole("menuitem", { name: "Low", exact: true }).click();
    await expect(page.locator(".td-toast")).toContainText("Set priority Low");
    await page.keyboard.press("Escape");
    await context.setOffline(true);
    await row.focus();
    await page.keyboard.press("3");
    await expect(row).toContainText("Medium");
    await page.keyboard.press("z");
    await expect(row).toContainText("High");
    await expect(page.locator(".td-toast")).toContainText("Undoing…");
    await context.setOffline(false);
    await expect(page.locator(".td-toast")).toContainText("also reverted later edits to priority");
    await expect.poll(async () => (await (await page.request.get(`/api/items/${id}`)).json()).priority).toBe("HIGH");
  } finally { await context.setOffline(false); await f.cleanup(); }
});

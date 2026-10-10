// The list rows follow the list / listitem pattern (controls inside stay real buttons), so this guards
// the keyboard model that rides on them: roving focus with arrows, S to select, Enter to open.
import { expect, test } from "@playwright/test";

import { freshProject, seedProjectId, signIn, useScope } from "./helpers";

test("list rows: arrows move focus, S selects, Enter opens the item", async ({ page }) => {
  await useScope(page, "rounded-dark");
  await signIn(page);
  const pid = await seedProjectId(page);
  await page.goto(`/p/${pid}?v=list`);
  const list = page.getByRole("list", { name: / items$/ }).first();
  await expect(list).toBeVisible();
  // Rows are the draggable items; a row with subitems wraps its listitem role around the group.
  const rows = list.locator("[data-drag-id]");
  await expect(rows.first()).toBeVisible();
  await rows.first().focus();
  await page.keyboard.press("ArrowDown");
  const second = rows.nth(1);
  await expect(second).toBeFocused();
  await page.keyboard.press("s");
  await expect(second).toHaveAttribute("data-selected", "true");
  await expect(second.getByText("Selected", { exact: true })).toBeAttached();
  await expect(page.getByRole("toolbar", { name: /selected item/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(second).not.toHaveAttribute("data-selected", "true");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog").first()).toBeVisible();
  await expect(page).toHaveURL(/item=/);
});

// Same-list reorders raise no toast; the hidden polite region says where the item landed (DESIGN.md › Drag & drop).
test("a same-list keyboard move is announced, not toasted", async ({ page }) => {
  await signIn(page);
  const f = await freshProject(page, "Reorder");
  try {
    for (const t of ["First", "Second", "Third"]) await f.item(`${t} ${f.projectId.slice(0, 4)}`);
    await page.goto(`/p/${f.projectId}?v=list`);
    const first = page.locator("[data-drag-id]", { hasText: "First" });
    await first.focus();
    await page.keyboard.press("ControlOrMeta+ArrowDown");
    await expect(page.locator("[data-announcer]")).toContainText(/Moved “First \w+” to position 2 of 3 in To-do/);
    await expect(page.locator(".td-toast")).toHaveCount(0);
  } finally {
    await f.cleanup();
  }
});

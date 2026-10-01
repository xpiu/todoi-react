// The list rows follow the list / listitem pattern (controls inside stay real buttons), so this guards
// the keyboard model that rides on them: roving focus with arrows, S to select, Enter to open.
import { expect, test } from "@playwright/test";

import { seedProjectId, signIn, useScope } from "./helpers";

test("list rows: arrows move focus, S selects, Enter opens the item", async ({ page }) => {
  await useScope(page, "standard-dark");
  await signIn(page);
  const pid = await seedProjectId(page);
  await page.goto(`/p/${pid}?v=list`);
  const rows = page.locator(".td-lrow[data-drag-id]");
  await expect(rows.first()).toBeVisible();
  await expect(page.locator('[role="list"][aria-label$=" items"]').first()).toBeVisible();
  await rows.first().focus();
  await page.keyboard.press("ArrowDown");
  const second = rows.nth(1);
  await expect(second).toBeFocused();
  await page.keyboard.press("s");
  await expect(second).toHaveAttribute("data-selected", "true");
  await expect(second.locator(".td-sr-only")).toHaveText("Selected");
  await expect(page.locator(".td-bulk")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(second).not.toHaveAttribute("data-selected", "true");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog").first()).toBeVisible();
  await expect(page).toHaveURL(/item=/);
});

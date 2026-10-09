// The Plan page's closing tips: general advice for a large sync, and the one action beside it.
import { expect, test } from "@playwright/test";

test("the tips close the Plan page, and Pick a first batch unticks every feature", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".cds-row-title").first()).toBeVisible();
  const tips = page.getByRole("region", { name: "Before a large sync" });
  await expect(tips.getByRole("listitem")).toHaveCount(4);
  await expect(tips).toContainText("Sync in small batches.");
  await expect(tips).toContainText("Compare the big components visually.");

  const count = page.locator(".cds-selectbar-count strong");
  await expect(count).not.toHaveText("0");
  await tips.getByRole("button", { name: "Pick a first batch" }).click();
  await expect(count).toHaveText("0");
  await expect(page.locator("#ledger")).toBeInViewport();
});

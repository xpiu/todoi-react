import { expect, test } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";

import { checkA11y, SCOPES, trackAccounts, useScope } from "./helpers";
import { apiOffline, guestItem, itemCheckbox, serverItems } from "./sync-helpers";

trackAccounts(test);

test("a queued edit survives an actual reload and saves once on reconnect", async ({ page, context }) => {
  const fixture = await guestItem(page);
  const reconnect = await apiOffline(context);
  await itemCheckbox(page, fixture.id).click();
  await expect(itemCheckbox(page, fixture.id, true)).toBeChecked();
  await expect(page.getByRole("banner").getByRole("button", { name: /1 edit/ })).toBeVisible();
  await page.reload();
  await expect(itemCheckbox(page, fixture.id, true)).toBeChecked();
  await expect(page.getByRole("banner").getByRole("button", { name: /1 edit/ })).toBeVisible();
  expect((await serverItems(page, fixture.projectId)).find((item) => item.id === fixture.id)?.done).toBe(false);
  await page.screenshot({ path: ".tmp/shots/offline-reloaded.png", animations: "disabled" });
  await reconnect();
  await expect.poll(async () => (await serverItems(page, fixture.projectId)).find((item) => item.id === fixture.id)?.done).toBe(true);
  await expect(page.getByRole("banner").getByRole("button", { name: /saved on this device|couldn't sync/ })).toHaveCount(0);
});

test("closing and reopening a tab retains its queue and local change", async ({ page, context }) => {
  const fixture = await guestItem(page);
  const reconnect = await apiOffline(context);
  await itemCheckbox(page, fixture.id).click();
  await expect(page.getByRole("banner").getByRole("button", { name: /1 edit/ })).toBeVisible();
  await page.close();
  const next = await context.newPage();
  await next.goto(`/p/${fixture.projectId}?v=list`);
  await expect(itemCheckbox(next, fixture.id, true)).toBeChecked();
  expect((await serverItems(next, fixture.projectId)).find((item) => item.id === fixture.id)?.done).toBe(false);
  await next.screenshot({ path: ".tmp/shots/offline-reopened.png", animations: "disabled" });
  await reconnect();
  await expect.poll(async () => (await serverItems(next, fixture.projectId)).find((item) => item.id === fixture.id)?.done).toBe(true);
});

for (const scope of SCOPES) test(`durable offline recovery is readable and accessible in ${scope}`, async ({ page, context }) => {
  await useScope(page, scope);
  const fixture = await guestItem(page);
  const reconnect = await apiOffline(context);
  await itemCheckbox(page, fixture.id).click();
  const status = page.getByRole("banner").getByRole("button", { name: /1 edit/ });
  await expect(status).toBeVisible();
  await status.click();
  await expect(page.getByRole("menu")).toContainText(/saved on this device/i);
  await page.screenshot({ path: `.tmp/shots/offline-${scope}-menu.png`, animations: "disabled" });
  // Base UI's invisible focus sentinels are intentional keyboard infrastructure, not menu content.
  const menuA11y = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).disableRules(["color-contrast"]).exclude("[data-base-ui-focus-guard]").analyze();
  expect(menuA11y.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical").map((violation) => violation.id)).toEqual([]);
  await page.getByRole("menuitem", { name: "Storage & sync settings" }).click();
  await expect(page.getByText(/1 edit is waiting to sync to the server/)).toBeVisible();
  await page.getByRole("button", { name: "Review saved change", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Saved change", exact: true })).toBeVisible();
  await checkA11y(page, `${scope} durable offline settings`);
  await page.screenshot({ path: `.tmp/shots/offline-${scope}-settings.png`, animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("html")).toHaveAttribute("data-device", "phone");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect.poll(async () => (await page.locator(".td-set-main").boundingBox())?.width ?? 0).toBeGreaterThan(300);
  await checkA11y(page, `${scope} durable offline mobile`);
  await page.screenshot({ path: `.tmp/shots/offline-${scope}-mobile.png`, animations: "disabled" });
  await page.getByRole("textbox", { name: "Saved change", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `.tmp/shots/offline-${scope}-mobile-recovery.png`, animations: "disabled" });
  await reconnect();
});

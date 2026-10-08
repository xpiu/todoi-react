// Import interactions use their own world and intercepted downloads, without calling Claude Code.
import { dirname, join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

import { ownWorld } from "./world";

async function openChoice(page: Page, url: string) {
  await page.goto(`${url}/mapping`);
  await page.getByRole("button", { name: "Bring the mapping up to date" }).click();
  const choice = page.getByRole("region", { name: "Bring in Design's changes" });
  await expect(choice).toBeVisible();
  return choice;
}

test("ignores repeated drops during an import and allows a retry after failure", async ({ page }) => {
  const world = await ownWorld();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let requests = 0;
  await page.route("**/api/import-file?*", async (route) => {
    requests++;
    await pending;
    await route.fulfill({ status: 400, json: { error: "Invalid export" } });
  });
  // Count actual fetches in the browser so a second request cannot hide in the network queue.
  await page.addInitScript(() => {
    const fetch = window.fetch;
    Object.assign(window, { importRequests: 0 });
    window.fetch = (...args) => {
      if (String(args[0]).includes("/api/import-file?")) Reflect.set(window, "importRequests", Reflect.get(window, "importRequests") + 1);
      return fetch(...args);
    };
  });
  try {
    const choice = await openChoice(page, world.url);
    const drop = () => choice.locator(".cds-routes-import").evaluate((el) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(new File(["zip"], "export.zip", { type: "application/zip" }));
      el.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
    });
    await drop();
    await expect(choice.getByRole("button", { name: "Choose a .zip…" })).toBeDisabled();
    await drop();
    expect(await page.evaluate(() => Reflect.get(window, "importRequests"))).toBe(1);
    release();
    await expect(choice.locator(".cds-error-inline")).toHaveText("Invalid export");
    await drop();
    await expect(choice.locator(".cds-error-inline")).toHaveText("Invalid export");
    expect(await page.evaluate(() => Reflect.get(window, "importRequests"))).toBe(2);
    expect(requests).toBe(2);
  } finally {
    release();
    await world.close();
  }
});

test("refreshes detected exports and forgets the previous freshness check when switching projects", async ({ page }) => {
  const world = await ownWorld();
  world.fx.ctx.configFile = join(dirname(world.fx.repo), "config.json");
  await page.route("**/api/exports", async (route) => {
    const response = await route.fetch();
    const info = await response.json();
    const id = world.fx.ctx.config.design.projectId;
    await route.fulfill({ json: { ...info, exports: [{ path: `/downloads/${id}.zip`, name: `${id}.zip`, kind: "zip", bytes: 1024, modifiedAt: new Date().toISOString(), covers: null }] } });
  });
  try {
    const choice = await openChoice(page, world.url);
    await expect(choice.locator(".cds-routes-file-name")).toHaveText("fake.zip");
    const before = await (await page.request.get(`${world.url}/api/exports`)).json();
    expect(before.checkedAt).not.toBeNull();
    const foot = page.getByRole("contentinfo");
    await foot.getByRole("button", { name: "Edit" }).click();
    await foot.getByLabel("Project link or id").fill("fake-2");
    await foot.getByRole("button", { name: "Use this project" }).click();
    await expect(foot).toContainText("Other Design System");
    await expect(choice.locator(".cds-routes-file-name")).toHaveText("fake-2.zip");
    const after = await (await page.request.get(`${world.url}/api/exports`)).json();
    expect(after).toMatchObject({ checkedAt: null, designUpdatedAt: null });
  } finally {
    await world.close();
  }
});

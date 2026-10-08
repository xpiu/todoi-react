// Import interactions use their own world and intercepted downloads, without calling Claude Code.
import AxeBuilder from "@axe-core/playwright";
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

import { ownWorld } from "./world";

for (const path of ["/", "/mapping"]) {
  test(`offers project archive directly on ${path} without a Claude Code check`, async ({ page }) => {
    const world = await ownWorld();
    try {
      await page.goto(`${world.url}${path}`);
      const entry = page.getByRole("button", { name: "Import project archive", exact: true });
      await expect(entry).toBeInViewport();
      const before = await (await page.request.get(`${world.url}/api/meter`)).json();
      await entry.focus();
      await page.keyboard.press("Enter");
      const choice = page.getByRole("region", { name: "Bring in Design's changes" });
      await expect(choice).toBeFocused();
      await expect(choice.getByRole("list", { name: "Claude Design download steps" }).getByRole("listitem")).toHaveText(["Share", "Project HTML", "Project archive", "Export"]);
      await expect(choice.getByText("Recommended · No tokens", { exact: true })).toBeVisible();
      await expect(choice.getByRole("link", { name: "Open Claude Design" })).toHaveAttribute("href", /claude.ai\/design\/p\/fake$/);
      await expect(choice.getByRole("button", { name: "Pull the project" })).toBeHidden();
      const after = await (await page.request.get(`${world.url}/api/meter`)).json();
      expect(after.calls).toBe(before.calls);
      await choice.getByRole("button", { name: "Close", exact: true }).click();
      await expect(entry).toBeFocused();
    } finally {
      await world.close();
    }
  });
}

for (const covers of [true, false, null]) {
  test(`keeps the archive route primary with download freshness ${covers}`, async ({ page }) => {
    const world = await ownWorld();
    await page.route("**/api/exports", async (route) => {
      const response = await route.fetch();
      const info = await response.json();
      await route.fulfill({ json: { ...info, designUpdatedAt: new Date().toISOString(), exports: [{ path: "/downloads/kit.zip", name: "Todoi Design System.zip", kind: "zip", bytes: 6700489, modifiedAt: new Date().toISOString(), covers }] } });
    });
    try {
      await page.goto(world.url);
      await page.getByRole("button", { name: "Import project archive", exact: true }).click();
      const choice = page.getByRole("region", { name: "Bring in Design's changes" });
      await expect(choice.locator(".cds-routes-file-name")).toHaveText("Todoi Design System.zip");
      await expect(choice.locator(".cds-btn-primary")).toHaveText(covers === false ? /Open Claude Design/ : /Import this archive/);
      // Instructions remain visible even when Downloads already contains an archive.
      await expect(choice.getByRole("list", { name: "Claude Design download steps" })).toBeVisible();
      await choice.locator(".cds-routes-pull summary").click();
      const fallback = choice.getByRole("button", { name: "Pull the project" });
      await expect(fallback).toBeVisible();
      await expect(fallback).not.toHaveClass(/cds-btn-primary/);
    } finally {
      await world.close();
    }
  });
}

test("imports a project archive from the direct route without model calls", async ({ page }) => {
  const world = await ownWorld();
  try {
    const zip = join(dirname(world.fx.repo), "Project archive.zip");
    execFileSync("zip", ["-qr", zip, "."], { cwd: world.fx.designNowDir });
    await page.goto(world.url);
    await page.getByRole("button", { name: "Import project archive", exact: true }).click();
    const before = await (await page.request.get(`${world.url}/api/meter`)).json();
    await page.locator('.cds-routes input[type="file"]').setInputFiles(zip);
    await expect(page.getByRole("region", { name: "Bring in Design's changes" })).toHaveCount(0);
    const state = await (await page.request.get(`${world.url}/api/state`)).json();
    expect(state.snapshots[0]).toMatchObject({ source: "import", label: "Imported Project archive.zip" });
    const after = await (await page.request.get(`${world.url}/api/meter`)).json();
    expect(after.calls).toBe(before.calls);
  } finally {
    await world.close();
  }
});

test("the first-run archive guide fits light, dark, narrow and zoomed layouts", async ({ page }, testInfo) => {
  const world = await ownWorld();
  rmSync(join(world.fx.ctx.state, "snapshots"), { recursive: true });
  try {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(world.url);
    await expect(page.getByRole("heading", { name: "Bring in the Design side" })).toBeVisible();
    await expect(page.locator(".cds-archive-empty")).toBeVisible();
    for (const [name, width, height, mode] of [
      ["desktop-light", 1440, 1000, "light"],
      ["desktop-dark", 1440, 1000, "dark"],
      ["tablet", 768, 1024, "light"],
      ["phone", 390, 844, "light"],
      ["zoom-200-equivalent", 720, 500, "light"],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: mode, reducedMotion: "reduce" });
      await expect(page.locator("html")).toHaveAttribute("data-mode", mode);
      await page.locator(".cds-onboard").evaluate(async (el) => { await Promise.all(el.getAnimations({ subtree: true }).map((animation) => animation.finished)); });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.getByRole("link", { name: "Open Claude Design" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Choose a .zip…" })).toBeVisible();
      const axe = await new AxeBuilder({ page }).include(".cds-onboard").analyze();
      expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
    }
  } finally {
    await world.close();
  }
});

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

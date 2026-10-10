import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { nanoid } from "nanoid";

import { freshProject, SCOPES, trackAccounts, useScope } from "./helpers";

trackAccounts(test);

async function download(page: Page, format: "CSV" | "Markdown", count: number) {
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(page.getByText(`This ${page.url().includes("v=board") ? "board" : "list"} view · ${count} items · filters applied`, { exact: true })).toBeVisible();
  const saved = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: format, exact: false }).click();
  const file = await saved;
  const path = await file.path();
  expect(path).not.toBeNull();
  return readFile(path!, "utf8");
}

for (const scope of SCOPES) test(`exports preserve visible items, sorting and counts in ${scope}`, async ({ page }) => {
  await useScope(page, scope);
  await page.goto("/");
  await expect(page).toHaveURL(/\/p\//);
  const groups = await (await page.request.get("/api/groups")).json();
  const project = await freshProject(page, "Export accuracy", { groupId: groups[0].id, lists: [["Zulu", "TODO"], ["Alpha", "DOING"], ["Hidden", "TODO"]] });
  try {
    const [zulu, alpha, hidden] = project.lists;
    const parent = await project.item("Zulu zebra", { priority: "HIGH" });
    await project.item("Zulu amber", { priority: "HIGH" });
    await project.item("Alpha item", { listId: alpha!.id, priority: "HIGH" });
    const completed = await project.item("Completed item", { priority: "HIGH" });
    expect((await page.request.patch(`/api/items/${completed}`, { data: { done: true } })).ok()).toBeTruthy();
    await project.item("Hidden item", { listId: hidden!.id, priority: "HIGH" });
    await project.item("Low priority", { priority: "LOW" });
    await project.item("Subitem", { parentItemId: parent, priority: "HIGH" });
    expect((await page.request.patch(`/api/lists/${hidden!.id}`, { data: { hidden: true } })).ok()).toBeTruthy();
    await page.goto("/settings");
    const showCompleted = page.getByRole("switch", { name: "Show completed items" });
    await expect(showCompleted).toHaveAttribute("aria-checked", "true");
    await showCompleted.click();
    await expect.poll(async () => (await (await page.request.get("/api/me")).json()).prefs.showCompleted).toBe(false);

    const titles = ["Alpha item", "Zulu amber", "Zulu zebra"];
    for (const view of ["list", "board"] as const) {
      await page.goto(`/p/${project.projectId}?v=${view}&f=priority:High&s=lists.name.asc,items.title.asc`);
      const roots = page.locator(view === "list" ? '.td-lrow[data-drag-id]:not(.td-lrow-sub)' : '.td-card[data-drag-id]');
      await expect(page.getByText("Zulu amber", { exact: true }).first()).toBeVisible();
      // Top-level rows and the downloaded rows follow the same list and item order.
      const rootTitles = await roots.locator(view === "list" ? ".td-lrow-title" : ".td-card-title").allTextContents();
      expect(rootTitles).toEqual(titles);
      const csv = await download(page, "CSV", 3);
      expect(csv.trim().split("\n").slice(1).map((row) => row.split(",")[0])).toEqual(titles);
      await expect(page.getByRole("status").filter({ hasText: "Exported" })).toContainText("3 items");
      const md = await download(page, "Markdown", 3);
      expect(md.indexOf("## Alpha")).toBeLessThan(md.indexOf("## Zulu"));
      expect(md.indexOf("Zulu amber")).toBeLessThan(md.indexOf("Zulu zebra"));
      for (const excluded of ["Completed item", "Hidden item", "Low priority", "Subitem"]) expect(md).not.toContain(excluded);
      await page.screenshot({ path: `.tmp/quick-wins/shots/${scope}-export-${view}.png` });
    }

    // A saved view resolves the same definition for both rendering and export.
    const savedId = nanoid();
    expect((await page.request.post("/api/saved-views", { data: { id: savedId, projectId: project.projectId, name: "High priority", shared: false, definition: { view: "list", filters: [{ type: "priority", value: "High" }], sort: { lists: { key: "count", dir: "desc" }, items: { key: "title", dir: "desc" } } } } })).ok()).toBeTruthy();
    await page.goto(`/p/${project.projectId}?view=${savedId}`);
    await expect(page.locator(`.td-lsec[data-list-id="${zulu!.id}"]`)).toBeVisible();
    expect((await download(page, "CSV", 3)).trim().split("\n").slice(1).map((row) => row.split(",")[0])).toEqual(["Zulu zebra", "Zulu amber", "Alpha item"]);
  } finally {
    await project.cleanup();
  }
});

import { expect, test as base } from "@playwright/test";

import { freshProject, signIn } from "./helpers";

// Data freshness (DESIGN.md › Data freshness): counts agree across screens and tabs without a reload, and
// another person's change shows within the 30-second poll. A fresh project keeps the numbers exact.
type Fixture = { projectId: string; name: string; first: string; second: string };
const test = base.extend<{ fixture: Fixture }>({
  fixture: async ({ page }, use) => {
    await signIn(page);
    const f = await freshProject(page, "Fresh", { lists: [["To-do", "TODO"], ["Done", "DONE"]] });
    try {
      await use({ projectId: f.projectId, name: f.name, first: await f.item("Fresh first"), second: await f.item("Fresh second") });
    } finally {
      await f.cleanup();
    }
  },
});

test("another tab's Projects counts and Archive follow edits made in this tab", async ({ page, context, fixture: f }) => {
  const other = await context.newPage();
  await other.goto("/projects");
  const row = other.getByRole("row", { name: `Open ${f.name}` });
  await expect(row.locator(".td-tbl-num")).toHaveText(["2", "0%"]);

  await page.goto(`/p/${f.projectId}?v=list`);
  await page.locator(`[data-drag-id="${f.first}"]`).getByRole("checkbox", { name: "Mark done" }).click();
  await expect(row.locator(".td-tbl-num")).toHaveText(["2", "50%"], { timeout: 5_000 });

  await page.goto(`/p/${f.projectId}?v=list&item=${f.second}`);
  await page.getByRole("button", { name: "Item options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Archive", exact: true }).click();
  await expect(row.locator(".td-tbl-num")).toHaveText(["1", "100%"], { timeout: 5_000 });
  await other.screenshot({ path: ".tmp/test-results/freshness-other-tab.png" });

  // In this tab, the Archive and the Projects table agree with what just happened, with no reload.
  await page.getByRole("button", { name: "Projects — All projects across groups" }).click();
  await expect(page.getByRole("row", { name: `Open ${f.name}` }).locator(".td-tbl-num")).toHaveText(["1", "100%"]);
  await other.goto(`/archive?project=${f.projectId}`);
  const archive = other.getByRole("list", { name: "Archive", exact: true });
  await expect(archive.getByRole("listitem")).toHaveCount(1);
  await archive.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.getByRole("row", { name: `Open ${f.name}` }).locator(".td-tbl-num")).toHaveText(["2", "50%"], { timeout: 5_000 });
});

test("another person's change appears within the 30-second poll", async ({ page, fixture: f }) => {
  await page.clock.install();
  await page.goto(`/p/${f.projectId}?v=list`);
  await expect(page.getByText("Fresh first")).toBeVisible();
  // Not through this browser's app: as another client would.
  expect((await page.request.patch(`/api/items/${f.first}`, { data: { title: "Renamed elsewhere" } })).ok()).toBeTruthy();
  await page.clock.runFor(5_000);
  await expect(page.getByText("Renamed elsewhere")).toHaveCount(0);
  await page.clock.runFor(30_000);
  await expect(page.getByText("Renamed elsewhere")).toBeVisible();
});

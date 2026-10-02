import { expect, test as base } from "@playwright/test";
import { nanoid } from "nanoid";

import type { ProjectDetail } from "../../src/client/data/api";
import { seedProjectId, signIn } from "./helpers";

// Data freshness (DESIGN.md › Data freshness): counts agree across screens and tabs without a reload, and
// another person's change shows within the 30-second poll. A fresh project keeps the numbers exact.
type Fixture = { projectId: string; name: string; first: string; second: string };
const test = base.extend<{ fixture: Fixture }>({
  fixture: async ({ page }, use) => {
    await signIn(page);
    const seed = await (await page.request.get(`/api/projects/${await seedProjectId(page)}`)).json() as ProjectDetail;
    const projectId = nanoid(), name = `Fresh ${projectId.slice(0, 6)}`;
    expect((await page.request.post("/api/projects", { data: { id: projectId, groupId: seed.groupId, name, lists: [["To-do", "TODO"], ["Done", "DONE"]] } })).status()).toBe(201);
    try {
      const listId = ((await (await page.request.get(`/api/projects/${projectId}`)).json()) as ProjectDetail).lists[0]!.id;
      const [first, second] = [nanoid(), nanoid()];
      for (const [id, title] of [[first, "Fresh first"], [second, "Fresh second"]]) expect((await page.request.post("/api/items", { data: { id, title, listId } })).status()).toBe(201);
      await use({ projectId, name, first, second });
    } finally {
      expect([204, 404]).toContain((await page.request.delete(`/api/archive/projects/${projectId}`)).status());
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

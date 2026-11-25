// Quick add in the ungrouped List and Board views (decision R3, as Linear and Todoist do): no toast when the new item
// shows where it was typed; one toast with Undo when the view won't show it — "Added · hidden by the current filters".
// Every item lives in the test's own project, removed afterwards. Spec: DESIGN.md › Group by, Toasts.
import { expect, test as base, type Page } from "@playwright/test";

import type { Item } from "../../src/client/data/api";
import { freshProject, signIn, type FreshProject } from "./helpers";

const test = base.extend<{ own: FreshProject }>({
  own: async ({ page }, use) => {
    await signIn(page);
    const own = await freshProject(page, "Quick add");
    try {
      await use(own);
    } finally {
      await own.cleanup();
    }
  },
});

const byTitle = async (page: Page, projectId: string, title: string) => ((await (await page.request.get(`/api/items?projectId=${projectId}`)).json()) as Item[]).find((it) => it.title === title);

for (const view of ["list", "board"] as const) {
  test(`${view} view with a filter: an added item the filters hide raises one toast, and its Undo removes it`, async ({ page, own }) => {
    await own.item("Pick the paint", { priority: "HIGH" });
    await page.goto(`/p/${own.projectId}?v=${view}&f=priority:High`);
    await page.getByRole("button", { name: view === "list" ? "Add an item at the top of To-do" : "Add an item", exact: true }).first().click();
    const field = page.getByRole("textbox", { name: /New (first )?item in To-do/ });
    await field.fill("Fuel the tanks !high");
    await field.press("Enter");
    await expect(page.getByRole("listitem").filter({ hasText: "Fuel the tanks" })).toBeVisible();
    // It shows where it was typed: no toast
    await expect(page.locator(".td-toast")).toHaveCount(0);
    await field.fill("Polish the canopy !low");
    await field.press("Enter");
    await field.press("Escape");
    await expect(page.getByRole("status").filter({ hasText: "Added · hidden by the current filters · “Polish the canopy”" })).toBeVisible();
    await expect.poll(async () => (await byTitle(page, own.projectId, "Polish the canopy"))?.priority).toBe("LOW");
    await page.getByRole("button", { name: /^Undo/ }).click();
    await expect.poll(async () => await byTitle(page, own.projectId, "Polish the canopy")).toBeUndefined();
    expect(await byTitle(page, own.projectId, "Fuel the tanks")).toBeTruthy();
  });
}

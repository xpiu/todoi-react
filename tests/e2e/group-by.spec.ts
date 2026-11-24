// Group by in List view (Design 2026-11-24, Part A): the toolbar's Group menu regroups the rows; dragging a row onto
// another group — or Ctrl/Cmd+Shift+↑↓ — changes that one field with one toast and Undo; a range group (This week,
// Later…) refuses and says why; the group rides in the URL and in a saved view. Every row lives in the test's own
// project, removed afterwards. Spec: DESIGN.md › Group by.
import { expect, test as base, type Locator, type Page } from "@playwright/test";
import { nanoid } from "nanoid";

import type { Item } from "../../src/client/data/api";
import { freshProject, signIn, type FreshProject } from "./helpers";

const test = base.extend<{ own: FreshProject }>({
  own: async ({ page }, use) => {
    await signIn(page);
    const own = await freshProject(page, "Grouping");
    try {
      await use(own);
    } finally {
      await own.cleanup();
    }
  },
});

/** HTML5 drag from a row onto a point inside a group section; returns the drop (or, for a refusal, the drag's end) */
async function drag(page: Page, from: Locator, to: Locator) {
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await from.dispatchEvent("dragstart", { dataTransfer });
  const box = (await to.boundingBox())!;
  const at = { dataTransfer, clientX: box.x + box.width / 2, clientY: box.y + Math.min(20, box.height / 2) };
  await to.dispatchEvent("dragover", at);
  return {
    drop: async () => {
      await to.dispatchEvent("drop", at);
      await from.dispatchEvent("dragend", { dataTransfer }, { timeout: 1000 }).catch(() => {});
    },
    end: () => from.dispatchEvent("dragend", { dataTransfer }),
  };
}

/** The toolbar's Group button (project names in the sidebar may start with "Group" too) */
const groupButton = (page: Page) => page.getByRole("toolbar", { name: "Project views and actions" }).locator('[data-menu="group"]');
const itemOf = async (page: Page, id: string) => (await (await page.request.get(`/api/items/${id}`)).json()) as Item;
const group = (page: Page, id: string) => page.locator(`.td-list-groups .td-list-section[data-group-id="${id}"]`);
const row = (page: Page, groupId: string, itemId: string) => group(page, groupId).locator(`.td-list-row[data-drag-id="${itemId}"]`);

test("Group by Priority: a drag and Ctrl/Cmd+Shift+↓ between groups change the priority, with Undo", async ({ page, own }) => {
  const high = await own.item("Pick the paint", { priority: "HIGH" });
  const none = await own.item("Call the hangar");
  await page.goto(`/p/${own.projectId}?v=list`);
  await groupButton(page).click();
  const menu = page.getByRole("dialog", { name: "Group options" });
  await menu.getByRole("radio", { name: "Priority" }).click();
  await expect(page).toHaveURL(/[?&]g=priority/);
  // The menu stays open on a pick; Escape closes it
  await expect(menu.getByRole("radio", { name: "Priority" })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");
  await expect(group(page, "HIGH")).toBeVisible();
  await expect(row(page, "__none", none)).toBeVisible();
  // No add rows in a grouped view
  await expect(page.locator(".td-list-groups [data-add-item]")).toHaveCount(0);

  // Drag "Call the hangar" onto High: the group rings, then the priority is set — one toast with Undo
  const d = await drag(page, row(page, "__none", none), group(page, "HIGH"));
  await expect(group(page, "HIGH")).toHaveAttribute("data-drop", "accept");
  await d.drop();
  await expect(page.getByRole("status").filter({ hasText: "Priority set to High · “Call the hangar”" })).toBeVisible();
  await expect.poll(async () => (await itemOf(page, none)).priority).toBe("HIGH");
  await expect(row(page, "HIGH", none)).toBeVisible();
  await page.getByRole("button", { name: /^Undo/ }).click();
  await expect.poll(async () => (await itemOf(page, none)).priority).toBeNull();
  await expect(row(page, "__none", none)).toBeVisible();

  // Keyboard twin: Ctrl/Cmd+Shift+↓ moves the focused item to the next group that takes it; focus follows
  await row(page, "HIGH", high).focus();
  await page.keyboard.press("ControlOrMeta+Shift+ArrowDown");
  await expect.poll(async () => (await itemOf(page, high)).priority).toBeNull();
  await expect(row(page, "__none", high)).toBeFocused();
  await expect(page.locator("[data-announcer]")).toContainText("Moved to No priority");
  await expect(page.getByRole("status").filter({ hasText: "Priority cleared · “Pick the paint”" })).toBeVisible();
});

test("Group by Due: Today takes a row, a range group refuses and says why", async ({ page, own }) => {
  const undated = await own.item("Order the decals");
  const later = await own.item("Renew the insurance", { dueDate: "2099-06-01" });
  await page.goto(`/p/${own.projectId}?v=list&g=due`);
  await expect(group(page, "none")).toBeVisible();
  await expect(group(page, "later")).toBeVisible();

  // Later covers many days: no drop, a ban glyph and the reason in its header
  const refused = await drag(page, row(page, "none", undated), group(page, "later"));
  await expect(group(page, "later")).toHaveAttribute("data-drop", "refuse");
  await expect(group(page, "later").locator(".td-list-section-dropnote")).toHaveText("Later covers many days. Open the item to pick a date.");
  await refused.end();
  await expect(page.locator("[data-announcer]")).toContainText("Later covers many days. Open the item to pick a date.");
  await expect(group(page, "later")).not.toHaveAttribute("data-drop");
  expect((await itemOf(page, undated)).dueDate).toBeNull();

  // "Show empty groups" brings Today back; dropping there sets today's date
  await groupButton(page).click();
  await page.getByRole("dialog", { name: "Group options" }).getByRole("checkbox", { name: "Show empty groups" }).click();
  await page.keyboard.press("Escape");
  await expect(group(page, "today")).toContainText("No items");
  const accepted = await drag(page, row(page, "later", later), group(page, "today"));
  await accepted.drop();
  await expect(page.getByRole("status").filter({ hasText: "Due date set to today · “Renew the insurance”" })).toBeVisible();
  await expect(row(page, "today", later)).toBeVisible();
  const today = (await itemOf(page, later)).dueDate;
  expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(today! < "2099-06-01").toBe(true);
  // Leave the device preference as it was
  await groupButton(page).click();
  await page.getByRole("dialog", { name: "Group options" }).getByRole("checkbox", { name: "Show empty groups" }).click();
});

test("the group is part of a saved view and its link", async ({ page, own }) => {
  await own.item("Paint the skids");
  await page.goto(`/p/${own.projectId}?v=list&g=label`);
  await expect(group(page, "__none")).toBeVisible();
  const views = page.getByRole("button", { name: "Show saved views" });
  if (await views.isVisible()) await views.click();
  await page.getByRole("button", { name: "Save view" }).click();
  const dialog = page.getByRole("dialog", { name: "Save view" });
  await expect(dialog.getByText("Grouped by Label")).toBeVisible();
  await dialog.getByRole("textbox", { name: "View name" }).fill("By label");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/[?&]view=/);

  const saved = (await (await page.request.get(`/api/saved-views?projectId=${own.projectId}`)).json()) as Array<{ id: string; name: string; definition: { group?: string } }>;
  const view = saved.find((v) => v.name === "By label")!;
  expect(view.definition.group).toBe("label");

  // A fresh visit through the saved view's link groups again; Board keeps the pick but shows its lists
  await page.goto(`/p/${own.projectId}?view=${view.id}&v=list`);
  await expect(group(page, "__none")).toBeVisible();
  await page.goto(`/p/${own.projectId}?view=${view.id}&v=board`);
  await groupButton(page).click();
  const menu = page.getByRole("dialog", { name: "Group options" });
  await expect(menu.getByRole("note")).toContainText("Groups show in List view.");
  await expect(menu.getByRole("radio", { name: "Label" })).toBeDisabled();
  await expect(menu.getByRole("radio", { name: "Label" })).toHaveAttribute("aria-checked", "true");
  await menu.getByRole("button", { name: "Open List view" }).click();
  await expect(page).toHaveURL(/[?&]v=list/);
  await expect(group(page, "__none")).toBeVisible();
});

test("Group by Label: a drop swaps the source label for the target's and keeps the others, with Undo", async ({ page, own }) => {
  const [design, sales, ops] = [nanoid(), nanoid(), nanoid()];
  for (const [id, name, color] of [[design, "design", "blue"], [sales, "sales", "orange"], [ops, "ops", "teal"]] as const) expect((await page.request.post("/api/labels", { data: { id, projectId: own.projectId, name, color } })).status()).toBe(201);
  const both = await own.item("Paint the tail", { labelIds: [design, ops] });
  await own.item("Count the bolts", { labelIds: [sales] });
  await page.goto(`/p/${own.projectId}?v=list&g=label`);
  // An item with two labels sits in both groups
  await expect(row(page, design, both)).toBeVisible();
  await expect(row(page, ops, both)).toBeVisible();
  const d = await drag(page, row(page, design, both), group(page, sales));
  await d.drop();
  await expect(page.getByRole("status").filter({ hasText: "Label set to sales · “Paint the tail”" })).toBeVisible();
  await expect.poll(async () => (await itemOf(page, both)).labelIds.sort()).toEqual([ops, sales].sort());
  await expect(row(page, sales, both)).toBeVisible();
  await expect(group(page, design)).toHaveCount(0);
  await page.getByRole("button", { name: /^Undo/ }).click();
  await expect.poll(async () => (await itemOf(page, both)).labelIds.sort()).toEqual([design, ops].sort());
});

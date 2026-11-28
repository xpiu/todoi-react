// Group by in List view: the toolbar's Sort menu regroups the rows; dragging a row onto
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

const toolbar = (page: Page) => page.getByRole("toolbar", { name: "Project views and actions" });
const sortButton = (page: Page) => toolbar(page).getByRole("button", { name: /^Sort/ });
const sortMenu = (page: Page) => page.getByRole("dialog", { name: "Sort options" });
const groupingButton = (menu: Locator) => menu.getByRole("button", { name: /^Group items by/ });
async function openGrouping(page: Page) {
  await sortButton(page).click();
  const menu = sortMenu(page);
  await groupingButton(menu).click();
  return menu;
}
const itemOf = async (page: Page, id: string) => (await (await page.request.get(`/api/items/${id}`)).json()) as Item;
const group = (page: Page, id: string) => page.locator(`.td-list-groups .td-list-section[data-group-id="${id}"]`);
const row = (page: Page, groupId: string, itemId: string) => group(page, groupId).locator(`.td-list-row[data-drag-id="${itemId}"]`);

test("Group by Priority: a drag and Ctrl/Cmd+Shift+↓ between groups change the priority, with Undo", async ({ page, own }) => {
  const high = await own.item("Pick the paint", { priority: "HIGH" });
  const none = await own.item("Call the hangar");
  await page.goto(`/p/${own.projectId}?v=list`);
  await expect(toolbar(page).getByRole("button", { name: /^Group/ })).toHaveCount(0);
  const menu = await openGrouping(page);
  const grouping = menu.getByRole("radiogroup", { name: "Group items by" });
  const sortItems = menu.getByRole("radiogroup", { name: "Sort items" });
  await sortItems.getByRole("radio", { name: /^Title/ }).click();
  await grouping.getByRole("radio", { name: "Priority" }).click();
  await expect(page).toHaveURL(/[?&]g=priority/);
  await expect(sortItems.getByRole("radio", { name: /^Title/ })).toBeChecked();
  await menu.getByRole("button", { name: "Reset sorting" }).click();
  await expect(page).not.toHaveURL(/[?&]s=/);
  await expect(menu.getByRole("button", { name: "Group items by Priority" })).toBeVisible();
  // The menu stays open on a pick; Escape closes it
  await expect(grouping.getByRole("radio", { name: "Priority" })).toBeChecked();
  await menu.getByRole("button", { name: "Collapse all groups" }).click();
  await menu.getByRole("button", { name: "Expand all groups" }).click();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(sortButton(page)).toBeFocused();
  await expect(group(page, "HIGH")).toBeVisible();
  await expect(row(page, "__none", none)).toBeVisible();
  // No bottom add rows in a grouped view: each group adds through its header + (below)
  await expect(page.locator(".td-list-groups .td-list-section-add")).toHaveCount(0);

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
  await (await openGrouping(page)).getByRole("checkbox", { name: "Show empty groups" }).click();
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
  await (await openGrouping(page)).getByRole("checkbox", { name: "Show empty groups" }).click();
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

  // A fresh visit through the saved view's link groups again; the other views keep the pick for List
  await page.goto(`/p/${own.projectId}?view=${view.id}&v=list`);
  await expect(group(page, "__none")).toBeVisible();
  for (const mode of ["board", "calendar"]) {
    await page.goto(`/p/${own.projectId}?view=${view.id}&v=${mode}`);
    await sortButton(page).click();
    await expect(sortMenu(page).getByRole("radiogroup", { name: "Sort items" })).toBeVisible();
    await expect(groupingButton(sortMenu(page))).toHaveCount(0);
  }
  await page.goto(`/p/${own.projectId}?view=${view.id}&v=list`);
  await expect(group(page, "__none")).toBeVisible();
  const menu = await openGrouping(page);
  const grouping = menu.getByRole("radiogroup", { name: "Group items by" });
  await expect(grouping.getByRole("radio", { name: "Label" })).toBeChecked();
  await grouping.getByRole("radio", { name: /^None/ }).click();
  await expect(page).not.toHaveURL(/[?&](?:g|view)=/);
  await expect(group(page, "__none")).toHaveCount(0);
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

/** The project's items, by title */
const byTitle = async (page: Page, projectId: string, title: string) => ((await (await page.request.get(`/api/items?projectId=${projectId}`)).json()) as Item[]).find((it) => it.title === title);

test("Group by Priority: an item added in a group gets that priority in its first list; Create › item opens in the focused item's group", async ({ page, own }) => {
  await own.item("Pick the paint", { priority: "HIGH" });
  const none = await own.item("Call the hangar");
  await page.goto(`/p/${own.projectId}?v=list&g=priority`);
  await group(page, "HIGH").getByRole("button", { name: "Add an item to High" }).click();
  const field = page.getByRole("textbox", { name: "New item in High" });
  await expect(field).toBeFocused();
  await field.fill("Inspect the rotor");
  await field.press("Enter");
  await expect(group(page, "HIGH").locator(".td-list-row", { hasText: "Inspect the rotor" })).toBeVisible();
  // It shows where it was typed: no toast (inline creation)
  await expect(page.locator(".td-toast")).toHaveCount(0);
  await expect.poll(async () => await byTitle(page, own.projectId, "Inspect the rotor")).toMatchObject({ priority: "HIGH", listId: own.lists[0]!.id });
  // A typed !priority wins over the group's: the item shows up in its own group, and one toast says where
  await field.fill("Wash the skids !low");
  await field.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Added to Low · “Wash the skids”" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Undo/ })).toBeVisible();
  await field.press("Escape");
  await expect.poll(async () => (await byTitle(page, own.projectId, "Wash the skids"))?.priority).toBe("LOW");
  await expect(group(page, "LOW").locator(".td-list-row", { hasText: "Wash the skids" })).toBeVisible();
  // No priority adds without one
  await group(page, "__none").getByRole("button", { name: "Add an item to No priority" }).click();
  await page.getByRole("textbox", { name: "New item in No priority" }).fill("Book the pilot");
  await page.getByRole("textbox", { name: "New item in No priority" }).press("Enter");
  await expect.poll(async () => await byTitle(page, own.projectId, "Book the pilot")).toMatchObject({ priority: null });
  await page.keyboard.press("Escape");

  // Create › Create an item (Default destination: the current project) opens the field in the group keyboard focus was
  // last on — No priority here, not the first group (High)
  await row(page, "__none", none).focus();
  await page.getByRole("button", { name: "Create" }).click();
  await page.getByRole("menuitem", { name: "Create an item" }).click();
  await expect(page.getByRole("textbox", { name: "New item in No priority" })).toBeFocused();
  await page.keyboard.press("Escape");
});

test("Group by Priority with a filter: an added item the filters hide raises one toast, and its Undo removes the item", async ({ page, own }) => {
  await own.item("Pick the paint", { priority: "HIGH" });
  await page.goto(`/p/${own.projectId}?v=list&g=priority&f=priority:High`);
  await group(page, "HIGH").getByRole("button", { name: "Add an item to High" }).click();
  const field = page.getByRole("textbox", { name: "New item in High" });
  await field.fill("Fuel the tanks");
  await field.press("Enter");
  await expect(group(page, "HIGH").locator(".td-list-row", { hasText: "Fuel the tanks" })).toBeVisible();
  await expect(page.locator(".td-toast")).toHaveCount(0);
  // !low puts it outside the High filter: it won't show anywhere in this view
  await field.fill("Polish the canopy !low");
  await field.press("Enter");
  await field.press("Escape");
  await expect(page.getByRole("status").filter({ hasText: "Added · hidden by the current filters · “Polish the canopy”" })).toBeVisible();
  await expect.poll(async () => (await byTitle(page, own.projectId, "Polish the canopy"))?.priority).toBe("LOW");
  await page.getByRole("button", { name: /^Undo/ }).click();
  await expect.poll(async () => await byTitle(page, own.projectId, "Polish the canopy")).toBeUndefined();
  expect(await byTitle(page, own.projectId, "Fuel the tanks")).toBeTruthy();
});

test("Group by Assignee: N opens the field in the focused item's group and the new item is assigned there", async ({ page, own }) => {
  const me = ((await (await page.request.get("/api/me")).json()) as { id: string; name: string });
  const mine = await own.item("Plan the route", { assigneeIds: [me.id] });
  await own.item("Charge the radios");
  await page.goto(`/p/${own.projectId}?v=list&g=assignee`);
  await row(page, me.id, mine).focus();
  await page.keyboard.press("n");
  const field = page.getByRole("textbox", { name: `New item in ${me.name}` });
  await expect(field).toBeFocused();
  await field.fill("File the flight plan");
  await field.press("Enter");
  await field.press("Escape");
  await expect.poll(async () => (await byTitle(page, own.projectId, "File the flight plan"))?.assigneeIds).toEqual([me.id]);
  await expect(group(page, me.id).locator(".td-list-row", { hasText: "File the flight plan" })).toBeVisible();
});

test("Group by Due: a range group has no +, so N there opens the first group that takes a value", async ({ page, own }) => {
  const late = await own.item("Renew the permit", { dueDate: "2020-01-06" });
  await own.item("Order the decals");
  await page.goto(`/p/${own.projectId}?v=list&g=due`);
  await expect(group(page, "overdue")).toBeVisible();
  await expect(group(page, "overdue").locator("[data-add-item]")).toHaveCount(0);
  await row(page, "overdue", late).focus();
  await page.keyboard.press("n");
  const field = page.getByRole("textbox", { name: "New item in No date" });
  await expect(field).toBeFocused();
  await field.fill("Sweep the hangar");
  await field.press("Enter");
  await field.press("Escape");
  await expect.poll(async () => await byTitle(page, own.projectId, "Sweep the hangar")).toMatchObject({ dueDate: null });
  await expect(group(page, "none").locator(".td-list-row", { hasText: "Sweep the hangar" })).toBeVisible();

  // With "Show empty groups", Today comes first among the groups that take a value: its items are due today
  await (await openGrouping(page)).getByRole("checkbox", { name: "Show empty groups" }).click();
  await page.keyboard.press("Escape");
  await row(page, "overdue", late).focus();
  await page.keyboard.press("n");
  const today = page.getByRole("textbox", { name: "New item in Today" });
  await expect(today).toBeFocused();
  await today.fill("Check the weather");
  await today.press("Enter");
  await today.press("Escape");
  await expect.poll(async () => (await byTitle(page, own.projectId, "Check the weather"))?.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await expect(group(page, "today").locator(".td-list-row", { hasText: "Check the weather" })).toBeVisible();
  // Leave the device preference as it was
  await (await openGrouping(page)).getByRole("checkbox", { name: "Show empty groups" }).click();
});

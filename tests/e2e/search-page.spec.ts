import { expect, test, type Page } from "@playwright/test";
import { nanoid } from "nanoid";

import { freshProject, signIn } from "./helpers";

// The Search page: the dropdown's "See all results" opens it with the query; it finds words in descriptions and
// comments, filters, and pages 20 at a time. Every test works in its own project, deleted afterwards.
const tagOf = () => "srch" + nanoid(6).toLowerCase().replace(/[^a-z]/g, "q");
const field = (page: Page) => page.getByRole("textbox", { name: "Search items" });
const results = (page: Page) => page.getByRole("list", { name: "Search results" });
const statusLine = (page: Page) => page.locator(".td-search-count");

test.beforeEach(async ({ page }) => signIn(page));

test("the dropdown's See all results opens the Search page with the query, and a result opens over it", async ({ page }) => {
  const p = await freshProject(page, "Search page");
  try {
    const tag = tagOf();
    await p.item(`Quarterly ${tag} report`);
    await page.goto(`/p/${p.projectId}`);
    const top = page.getByRole("banner").getByRole("combobox", { name: "Search" });
    await top.fill(tag);
    await expect(page.getByRole("button", { name: /See all results, with descriptions and comments/ })).toBeVisible();
    await top.press("Shift+Enter");
    await expect(page).toHaveURL(new RegExp(`/search\\?q=${tag}$`));
    await expect(page.getByRole("banner")).toContainText("Search");
    await expect(page.getByRole("button", { name: /^Back to / })).toBeVisible();
    await expect(field(page)).toHaveValue(tag);
    await expect(field(page)).toBeFocused();
    await expect(statusLine(page)).toHaveText("1 result");
    const row = results(page).getByRole("button", { name: new RegExp(`Quarterly ${tag} report`) });
    await expect(row.locator("mark")).toHaveText(tag);
    // ↓ from the field enters the results; ↵ opens the item over the page, and closing it comes back to the result.
    await field(page).press("ArrowDown");
    await expect(row).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: `Quarterly ${tag} report` })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(row).toBeFocused();
    await expect(page).toHaveURL(new RegExp(`/search\\?q=${tag}$`));
  } finally {
    await p.cleanup();
  }
});

test("a comment match names its author and shows a snippet with the match", async ({ page }) => {
  const p = await freshProject(page, "Search page");
  try {
    const tag = tagOf();
    const id = await p.item("Spare parts for the hangar");
    expect((await page.request.post(`/api/items/${id}/comments`, { data: { id: nanoid(), body: `The new ${tag} hub arrived on Tuesday, after a long wait at customs.` } })).status()).toBe(201);
    await p.item("Paint job", { description: `First sand the frame.\n\nThen the ${tag} blades need a coat.` });
    const me = (await (await page.request.get("/api/me")).json()) as { name: string };
    await page.goto(`/search?q=${tag}`);
    await expect(statusLine(page)).toHaveText("2 results");
    const rows = results(page).getByRole("button");
    // Descriptions rank above comments.
    await expect(rows.nth(0)).toContainText("Paint job");
    await expect(rows.nth(0)).toContainText("Description");
    await expect(rows.nth(1)).toContainText("Spare parts for the hangar");
    await expect(rows.nth(1)).toContainText(`Comment · ${me.name}`);
    await expect(rows.nth(1).locator(".td-search-snippet")).toContainText(`The new ${tag} hub arrived`);
    await expect(rows.nth(1).locator(".td-search-snippet mark")).toHaveText(tag);
  } finally {
    await p.cleanup();
  }
});

test("filters narrow the results and Clear filters brings them back", async ({ page }) => {
  const p = await freshProject(page, "Search page");
  try {
    const tag = tagOf();
    await p.item(`Doing ${tag}`, { status: "DOING" });
    await p.item(`Waiting ${tag}`);
    const archived = await p.item(`Shelved ${tag}`);
    expect((await page.request.patch(`/api/items/${archived}`, { data: { archived: true } })).status()).toBe(200);
    await page.goto(`/search?q=${tag}`);
    await expect(statusLine(page)).toHaveText("2 results");
    await page.getByRole("combobox", { name: /^Status/ }).click();
    await page.getByRole("option", { name: "Doing" }).click();
    await expect(page).toHaveURL(/status=DOING/);
    await expect(statusLine(page)).toHaveText("1 result");
    await expect(results(page)).toContainText(`Doing ${tag}`);
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(statusLine(page)).toHaveText("2 results");
    // Archived items only on request, marked, and they open through the "is archived" dialog.
    await page.getByRole("checkbox", { name: "Include archived" }).click();
    await expect(statusLine(page)).toHaveText("3 results");
    const shelved = results(page).getByRole("button", { name: new RegExp(`Shelved ${tag}`) });
    await expect(shelved).toContainText("Archived");
    await shelved.click();
    await expect(page.getByRole("dialog", { name: `“Shelved ${tag}” is archived` })).toBeVisible();
  } finally {
    await p.cleanup();
  }
});

test("Show more loads the next page and focuses its first result", async ({ page }) => {
  const p = await freshProject(page, "Search page");
  try {
    const tag = tagOf();
    for (let i = 1; i <= 23; i++) await p.item(`Batch ${tag} ${i}`);
    await page.goto(`/search?q=${tag}`);
    await expect(statusLine(page)).toHaveText("Showing 20 of 23 results");
    await expect(results(page).getByRole("button")).toHaveCount(20);
    await page.getByRole("button", { name: "Show 3 more" }).click();
    await expect(statusLine(page)).toHaveText("23 results");
    await expect(results(page).getByRole("button")).toHaveCount(23);
    await expect(results(page).getByRole("button").nth(20)).toBeFocused();
    await expect(page.getByRole("button", { name: /^Show \d+ more$/ })).toHaveCount(0);
  } finally {
    await p.cleanup();
  }
});

import { expect, test as base } from "@playwright/test";

import { freshProject, keyOf, PROJECT_URL, signIn, type FreshProject } from "./helpers";

// Links (README › Links): a project lives at /<slug>, its short public id; an open item is named by its key
// (?item=MP-102); a link by database id from before (/p/<id>, ?item=<id>) still opens and becomes the new one.
const test = base.extend<{ fixture: FreshProject }>({
  fixture: async ({ page }, use) => {
    await signIn(page);
    const f = await freshProject(page, "Links");
    try {
      await use(f);
    } finally {
      await f.cleanup();
    }
  },
});

test("a project opens at its slug, and the home page and an old id link lead there", async ({ page, fixture: f }) => {
  await page.goto("/");
  await expect(page).toHaveURL(PROJECT_URL);

  await page.goto(`/${f.slug}?v=board`);
  await expect(page.getByRole("button", { name: `Rename project: ${f.name}` })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/${f.slug}\\?v=board$`));

  // The link from before slugs keeps its query; Back does not return to it.
  await page.goto(`/p/${f.projectId}?v=board&f=priority:Urgent`);
  await expect(page).toHaveURL(new RegExp(`/${f.slug}\\?v=board&f=priority(%3A|:)Urgent$`));
  await expect(page.getByRole("button", { name: `Rename project: ${f.name}` })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: `Rename project: ${f.name}` })).toBeVisible();

  // The sidebar and the share menu use the slug.
  await page.goto("/inbox");
  await page.locator(".td-sidebar-row").filter({ hasText: f.name }).click();
  await expect(page).toHaveURL(new RegExp(`/${f.slug}$`));
  await page.getByRole("toolbar", { name: "Project views and actions" }).locator('button[data-tip="Members"]').click();
  await expect(page.getByRole("dialog", { name: "Project members and sharing" }).getByRole("textbox", { name: "Project link" })).toHaveValue(new RegExp(`^http://[^/]+/${f.slug}$`));
});

test("an open item is named by its key, however the link named it", async ({ page, fixture: f }) => {
  const id = await f.item("Keyed item");
  const key = await keyOf(page, id);
  expect(key).toMatch(/^[A-Z0-9]{2,5}-\d+$/);

  // Opening it from the list writes the key.
  await page.goto(`/${f.slug}?v=list`);
  const row = page.locator("[data-drag-id]").filter({ hasText: "Keyed item" });
  await row.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Keyed item", exact: true });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/${f.slug}\\?(.*&)?item=${key}(&|$)`));
  expect(page.url()).toContain("v=list");
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/item=/);

  // A key link opens the item on a cold load; lower case and the id are rewritten to the key.
  for (const ref of [key, key.toLowerCase(), id]) {
    await page.goto(`/${f.slug}?item=${ref}`);
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/${f.slug}\\?item=${key}$`));
  }
  // The whole old link: project id and item id.
  await page.goto(`/p/${f.projectId}?item=${id}`);
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/${f.slug}\\?item=${key}$`));
  // Rewriting the address left no extra step behind: one Back leaves the project page.
  await page.goto("/inbox");
  await page.goto(`/${f.slug}?item=${id}`);
  await expect(page).toHaveURL(new RegExp(`item=${key}$`));
  await page.goBack();
  await expect(page).toHaveURL(/\/inbox$/);
});

test("a key that names an archived or unknown item says so", async ({ page, fixture: f }) => {
  const id = await f.item("Shelved");
  const key = await keyOf(page, id);
  expect((await page.request.patch(`/api/items/${id}`, { data: { archived: true } })).ok()).toBeTruthy();
  await page.goto(`/${f.slug}?item=${key}`);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("“Shelved” is archived");
  await dialog.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByRole("dialog", { name: "Shelved", exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`item=${key}$`));

  await page.goto(`/${f.slug}?item=${key.split("-")[0]}-99999`);
  await expect(dialog).toContainText("This item doesn't exist");
  await dialog.getByRole("button", { name: "Close" }).first().click();
  await expect(page).not.toHaveURL(/item=/);
});

test("a slug nobody has says the project couldn't load, and other unknown paths are not projects", async ({ page, fixture: f }) => {
  await page.goto("/aaaaaaaaa2");
  await expect(page.getByText("We could not load this project")).toBeVisible();
  // Not a slug (no digit, or the wrong length): no project is looked up.
  const lookups: string[] = [];
  page.on("request", (r) => void (r.url().includes("/api/projects?slug=") && lookups.push(r.url())));
  await page.goto("/notaproject");
  await expect(page.getByText("Not Found")).toBeVisible();
  expect(lookups).toEqual([]);
  // The app's own pages are untouched by the root route.
  for (const path of ["/inbox", "/projects", "/settings", "/search", "/archive"]) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByText("We could not load this project")).toHaveCount(0);
  }
  await page.goto(`/${f.slug}`);
  await expect(page.getByRole("button", { name: `Rename project: ${f.name}` })).toBeVisible();
});

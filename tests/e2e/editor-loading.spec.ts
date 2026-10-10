import { expect, test as base } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";

import { checkA11y, freshProject, SCOPES, signIn, useScope } from "./helpers";
import { apiOffline } from "./sync-helpers";

type Fixture = { projectId: string; itemId: string };
const test = base.extend<{ fixture: Fixture }>({
  fixture: async ({ page }, use) => {
    await signIn(page);
    const project = await freshProject(page, "Editor loading");
    try {
      const itemId = await project.item("Editor fixture", { description: "The saved description" });
      await use({ projectId: project.projectId, itemId });
    } finally { await project.cleanup(); }
  },
});
const EDITOR_MODULE = /\/src\/client\/design\/overlay\/DescriptionEdit\.tsx(?:\?.*)?$/;

for (const scope of SCOPES) test(`cold editor preserves focus, formatting and keyboard behavior in ${scope}`, async ({ page, fixture }) => {
  await useScope(page, scope);
  await page.addInitScript(() => { window.requestIdleCallback = () => 0; });
  let release!: () => void;
  let requests = 0;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  await page.route(EDITOR_MODULE, async (route) => { requests++; await ready; await route.continue(); });
  try {
    await page.goto(`/p/${fixture.projectId}?v=list&item=${fixture.itemId}`);
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("The saved description", { exact: true })).toBeVisible();
    expect(requests).toBe(0);
    await dialog.getByRole("button", { name: "Edit description" }).focus();
    await page.keyboard.press("Enter");
    await expect(dialog.locator(".td-desc-edit .td-sk")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await page.keyboard.press("ControlOrMeta+Enter");
    await expect(dialog).toBeVisible();
    await checkA11y(page, `${scope} editor loading`);
    await page.screenshot({ path: `.tmp/quick-wins/shots/${scope}-editor-loading.png` });
    release();
    const editor = dialog.getByRole("textbox", { name: "Description", exact: true });
    await expect(editor).toHaveText("The saved description");
    await expect(editor).toBeFocused();
    await editor.fill("A formatted description");
    await page.keyboard.type(" n f g ?");
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(page).toHaveURL(new RegExp(`item=${fixture.itemId}`));
    await editor.press("ControlOrMeta+A");
    await dialog.getByRole("button", { name: /^Bold/ }).click();
    await expect(editor.locator("strong")).toContainText("A formatted description");
    await checkA11y(page, `${scope} editor editing`);
    await page.screenshot({ path: `.tmp/quick-wins/shots/${scope}-editor-editing.png` });
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog.locator(".td-desc-view strong")).toContainText("A formatted description n f g ?");
    await dialog.getByTitle("Click to edit description").click();
    await expect(editor).toBeFocused();
    await editor.press("Escape");
    await expect(dialog.locator(".td-desc-view strong")).toBeVisible();
    expect(requests).toBe(1);
  } finally { release(); }
});

test("a failed editor load recovers on the same item without losing its saved content", async ({ page, fixture }) => {
  await useScope(page, "minimal-light");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => { window.requestIdleCallback = () => 0; });
  let attempts = 0;
  await page.route(EDITOR_MODULE, (route) => ++attempts === 1 ? route.abort("internetdisconnected") : route.continue());
  await page.goto(`/p/${fixture.projectId}?v=list&item=${fixture.itemId}`);
  const dialog = page.getByRole("dialog");
  await dialog.getByTitle("Click to edit description").click();
  await expect(dialog.getByRole("alert")).toContainText("Couldn't load the editor");
  expect((await new AxeBuilder({ page }).include(".td-desc-load-error").withRules(["color-contrast"]).analyze()).violations).toEqual([]);
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: ".tmp/quick-wins/shots/minimal-light-editor-failed-phone.png" });
  // Browsers retain a rejected module import until reload; importing it again cannot recover.
  await dialog.getByRole("button", { name: "Reload", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`item=${fixture.itemId}`));
  await dialog.getByTitle("Click to edit description").click();
  const editor = dialog.getByRole("textbox", { name: "Description", exact: true });
  await expect(editor).toHaveText("The saved description");
  await expect(editor).toBeFocused();
  await editor.fill("A recovered draft");
  await page.screenshot({ path: ".tmp/quick-wins/shots/minimal-light-editor-recovered-phone.png" });
  await editor.press("Escape");
  await expect(dialog.getByText("The saved description", { exact: true })).toBeVisible();
  expect(attempts).toBe(2);
});

test("canceling a slow load keeps the description intact when the module arrives", async ({ page, fixture }) => {
  await page.addInitScript(() => { window.requestIdleCallback = () => 0; });
  let release!: () => void;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  await page.route(EDITOR_MODULE, async (route) => { await ready; await route.continue(); });
  try {
    await page.goto(`/p/${fixture.projectId}?v=list&item=${fixture.itemId}`);
    const dialog = page.getByRole("dialog");
    await dialog.getByTitle("Click to edit description").click();
    await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog.getByText("The saved description", { exact: true })).toBeVisible();
    release();
    await page.waitForLoadState("networkidle");
    await expect(dialog.getByRole("textbox", { name: "Description", exact: true })).toHaveCount(0);
    await dialog.getByTitle("Click to edit description").click();
    await expect(dialog.getByRole("textbox", { name: "Description", exact: true })).toHaveText("The saved description");
  } finally { release(); }
});

test("a retained draft survives a failed module load and recovery reload", async ({ page, fixture }) => {
  await page.addInitScript(() => { window.requestIdleCallback = () => 0; });
  const url = `/p/${fixture.projectId}?v=list&item=${fixture.itemId}`;
  await page.goto(url);
  const dialog = page.getByRole("dialog");
  const editor = dialog.getByRole("textbox", { name: "Description", exact: true });
  await dialog.getByTitle("Click to edit description").click();
  await expect(editor).toBeFocused();
  await editor.fill("My retained description draft");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  let attempts = 0;
  await page.route(EDITOR_MODULE, (route) => ++attempts === 1 ? route.abort("internetdisconnected") : route.continue());
  await page.goto(url);
  await expect(dialog.getByRole("alert")).toContainText("Couldn't load the editor");
  await dialog.getByRole("button", { name: "Reload", exact: true }).click();
  await expect(editor).toHaveText("My retained description draft");
  await expect(editor).toBeFocused();
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByText("My retained description draft", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Unsaved", { exact: true })).toHaveCount(0);
  expect(attempts).toBe(2);
});

test("idle preloading keeps rich editing available without a network connection", async ({ page, context, fixture }) => {
  const warmed = page.waitForResponse(EDITOR_MODULE);
  await page.goto(`/p/${fixture.projectId}?v=list&item=${fixture.itemId}`);
  expect((await warmed).ok()).toBeTruthy();
  // Network-idle includes the editor module's static dependencies.
  await page.waitForLoadState("networkidle");
  const reconnect = await apiOffline(context);
  await context.setOffline(true);
  try {
    const dialog = page.getByRole("dialog");
    await dialog.getByTitle("Click to edit description").click();
    const editor = dialog.getByRole("textbox", { name: "Description", exact: true });
    await expect(editor).toBeFocused();
    await editor.fill("Edited offline");
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(dialog.getByText("Edited offline", { exact: true })).toBeVisible();
  } finally { await context.setOffline(false); await reconnect(); }
  await expect.poll(async () => {
    const items = await (await page.request.get(`/api/items?projectId=${fixture.projectId}`)).json();
    return items.find((item: { id: string }) => item.id === fixture.itemId)?.description;
  }).toBe("Edited offline");
});

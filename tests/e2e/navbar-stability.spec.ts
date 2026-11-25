// The connection pill reports only noticeable work: an edit that lands in a blink must not flash it
// (and shove the hoisted SubNavbar along the bar); a slow one still shows it.
import { expect, test, type Page } from "@playwright/test";

import { freshProject, signIn, type FreshProject } from "./helpers";

let own: FreshProject;
test.beforeEach(async ({ page }) => {
  await signIn(page);
  own = await freshProject(page, "Navbar stability");
});
test.afterEach(async () => own.cleanup());

/** Every frame, the left edge and width of each top-bar child, recorded whenever one moves */
async function watchBar(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { barLayouts: string[] };
    const snap = () => [...document.querySelectorAll(".td-topnav > *")].map((el) => { const r = el.getBoundingClientRect(); return `${Math.round(r.left)}+${Math.round(r.width)}`; }).join(" ");
    w.barLayouts = [snap()];
    const tick = () => {
      const s = snap();
      if (s !== w.barLayouts.at(-1)) w.barLayouts.push(s);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  return () => page.evaluate(() => (window as unknown as { barLayouts: string[] }).barLayouts);
}

async function addItem(page: Page, title: string) {
  await page.goto(`/p/${own.projectId}?v=list`);
  await page.getByRole("button", { name: "Add an item", exact: true }).first().click();
  const input = page.getByRole("textbox", { name: /^New item in / });
  await input.fill(title);
  const layouts = await watchBar(page);
  await input.press("Enter");
  return layouts;
}

test("adding an item in List view leaves the top bar still", async ({ page }) => {
  const layouts = await addItem(page, "Lands in a blink");
  await expect.poll(async () => (await page.request.get(`/api/items?projectId=${own.projectId}`)).json()).toContainEqual(expect.objectContaining({ title: "Lands in a blink" }));
  // Past the pill's delay and its "Synced" moment
  await page.waitForTimeout(2500);
  expect(await layouts()).toHaveLength(1);
  await expect(page.locator(".td-topnav .td-connection")).toHaveCount(0);
});

test("a slow save still shows the connection pill", async ({ page }) => {
  await page.route("**/api/items", async (route) => {
    if (route.request().method() === "POST") await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await addItem(page, "Slow to land");
  await expect(page.locator(".td-topnav .td-connection")).toContainText("Syncing");
  await expect(page.locator(".td-topnav .td-connection")).toContainText("Synced");
  await expect(page.locator(".td-topnav .td-connection")).toHaveCount(0);
});

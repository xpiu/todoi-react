// The connection pill reports only noticeable work: an edit that lands in a blink must not flash it; a slow
// one still shows it. Either way the bar's controls stay put: the pill takes its room from the spacer.
import { expect, test, type Page } from "@playwright/test";

import { freshProject, signIn, type FreshProject } from "./helpers";

let own: FreshProject;
test.beforeEach(async ({ page }) => {
  await signIn(page);
  own = await freshProject(page, "Navbar stability");
});
test.afterEach(async () => own.cleanup());

/** Every frame: where each top-bar control sits (all but the spacer and the status slot) and the pill's text, recorded on change */
async function watchBar(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { bar: { layouts: string[]; pills: string[] } };
    const layout = () => [...document.querySelectorAll(".td-topnav > :not(.td-topnav-spacer, .td-topnav-status), .td-topnav .td-subnav > *")].map((el) => { const r = el.getBoundingClientRect(); return `${Math.round(r.left)}+${Math.round(r.width)}`; }).join(" ");
    const pill = () => document.querySelector(".td-topnav .td-connection")?.textContent ?? "";
    w.bar = { layouts: [layout()], pills: [pill()] };
    const tick = () => {
      const l = layout(), p = pill();
      if (l !== w.bar.layouts.at(-1)) w.bar.layouts.push(l);
      if (p !== w.bar.pills.at(-1)) w.bar.pills.push(p);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  return () => page.evaluate(() => (window as unknown as { bar: { layouts: string[]; pills: string[] } }).bar);
}

async function addItem(page: Page, title: string) {
  await page.goto(`/p/${own.projectId}?v=list`);
  await page.getByRole("button", { name: "Add an item", exact: true }).first().click();
  const input = page.getByRole("textbox", { name: /^New item in / });
  await input.fill(title);
  const bar = await watchBar(page);
  await input.press("Enter");
  return bar;
}

test("adding an item in List view neither flashes the pill nor moves the top bar", async ({ page }) => {
  const bar = await addItem(page, "Lands in a blink");
  await expect.poll(async () => (await page.request.get(`/api/items?projectId=${own.projectId}`)).json()).toContainEqual(expect.objectContaining({ title: "Lands in a blink" }));
  // Past the pill's delay and its "Synced" moment
  await page.waitForTimeout(2500);
  expect(await bar()).toEqual({ layouts: [expect.any(String)], pills: [""] });
});

test("a slow save shows the pill without moving the top bar", async ({ page }) => {
  await page.route("**/api/items", async (route) => {
    if (route.request().method() === "POST") await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  const bar = await addItem(page, "Slow to land");
  const pill = page.locator(".td-topnav .td-connection");
  await expect(pill).toContainText("Syncing");
  await expect(pill).toContainText("Synced");
  await expect(pill).toHaveCount(0);
  const { layouts, pills } = await bar();
  expect(pills).toEqual(["", "Syncing 1…", "Synced", ""]);
  expect(layouts).toHaveLength(1);
});

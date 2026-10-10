import { expect, test } from "@playwright/test";
import { nanoid } from "nanoid";

import { SCOPES, trackAccounts, useScope } from "./helpers";
import { apiOffline, guestItem, serverItems } from "./sync-helpers";

const { watch } = trackAccounts(test);

// Keep the transport latency identical before/after; measure inside the browser rather than
// including Playwright's polling time. These are local dev measurements, not staging SLAs.
for (const scope of SCOPES) test(`item creation latency in ${scope}`, async ({ page }, testInfo) => {
  await useScope(page, scope);
  const fixture = await guestItem(page);
  await page.goto(`/p/${fixture.projectId}?v=board`);
  const list = page.locator(`.td-list[data-list-id="${fixture.listId}"]`);
  await expect(list.getByText("Sync fixture", { exact: true })).toBeVisible();
  await page.waitForLoadState("networkidle");
  const requests: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/")) requests.push(`${request.method()} ${path}`);
  });
  await page.route("**/api/auth/get-session", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    await route.continue();
  });
  await page.route("**/api/items", async (route) => {
    if (route.request().method() === "POST") await new Promise((resolve) => setTimeout(resolve, 200));
    await route.continue();
  });
  const samples = [];
  for (let i = 0; i < 3; i++) {
    const title = `Performance item ${i + 1}`;
    await list.getByRole("button", { name: "Add an item", exact: true }).click();
    const input = list.getByRole("textbox", { name: /^New item in / });
    await input.fill(title);
    await page.evaluate((itemTitle) => {
      const metrics = { started: 0, optimistic: 0, confirmed: 0, pendingHeight: 0, confirmedHeight: 0 };
      (window as any).itemMetrics = metrics;
      document.addEventListener("keydown", () => { metrics.started = performance.now(); }, { once: true, capture: true });
      const observer = new MutationObserver(() => {
        const node = [...document.querySelectorAll<HTMLElement>(".td-card")].find((candidate) => candidate.querySelector(".td-card-title")?.textContent === itemTitle);
        if (!node || !metrics.started) return;
        if (!metrics.optimistic) { metrics.optimistic = performance.now() - metrics.started; metrics.pendingHeight = node.getBoundingClientRect().height; }
        if (/\d+$/.test(node.querySelector(".td-card-id")?.textContent ?? "")) {
          metrics.confirmed = performance.now() - metrics.started;
          metrics.confirmedHeight = node.getBoundingClientRect().height;
          observer.disconnect();
        }
      });
      observer.observe(document.querySelector(".td-board")!, { childList: true, subtree: true, characterData: true });
    }, title);
    await input.press("Enter");
    const card = list.locator(".td-card").filter({ hasText: title });
    await expect(card.locator(".td-card-id")).toHaveText(/\d+$/);
    samples.push(await page.evaluate(() => (window as any).itemMetrics));
    await input.press("Escape");
    await page.waitForLoadState("networkidle");
  }
  const result = { scope, latencyPerRequestMs: 200, samples, requests };
  expect(requests.filter((request) => request === "GET /api/auth/get-session")).toEqual([]);
  expect(requests.filter((request) => ["GET /api/labels", "GET /api/me", "GET /api/saved-views"].includes(request))).toEqual([]);
  expect(requests.filter((request) => request === "POST /api/items")).toHaveLength(3);
  for (const sample of samples) {
    expect(sample.optimistic).toBeGreaterThan(0);
    expect(sample.confirmed).toBeGreaterThan(sample.optimistic);
    expect(sample.confirmedHeight).toBe(sample.pendingHeight);
  }
  console.log(JSON.stringify(result));
  await testInfo.attach("creation-metrics", { body: JSON.stringify(result, null, 2), contentType: "application/json" });
  await page.screenshot({ path: `.tmp/shots/item-performance-${scope}.png`, animations: "disabled" });
});

test("a pending item keeps its place while typing the next item", async ({ page }, testInfo) => {
  const fixture = await guestItem(page);
  await page.goto(`/p/${fixture.projectId}?v=board`);
  const list = page.locator(`.td-list[data-list-id="${fixture.listId}"]`);
  await expect(list.getByText("Sync fixture", { exact: true })).toBeVisible();
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/items", async (route) => {
    if (route.request().method() === "POST") await held;
    await route.continue();
  });
  try {
    await list.getByRole("button", { name: "Add an item", exact: true }).click();
    const input = list.getByRole("textbox", { name: /^New item in / });
    await input.fill("An item saving in the background");
    await input.press("Enter");
    const card = list.locator(".td-card").filter({ hasText: "An item saving in the background" });
    await expect(card).toBeVisible();
    await input.fill("Keep typing while the server responds");
    await expect(input).toHaveValue("Keep typing while the server responds");
    const before = await card.boundingBox();
    await page.screenshot({ path: ".tmp/shots/item-pending.png", animations: "disabled" });
    release();
    await expect(card.locator(".td-card-id")).toHaveText(/\d+$/);
    const after = await card.boundingBox();
    expect(after).toEqual(before);
    await testInfo.attach("pending-layout", { body: JSON.stringify({ before, after }), contentType: "application/json" });
    await expect(input).toHaveValue("Keep typing while the server responds");
    await page.screenshot({ path: ".tmp/shots/item-confirmed.png", animations: "disabled" });
  } finally { release(); }
});

test("acknowledging a new item skips unchanged cards on a large board", async ({ page }, testInfo) => {
  // Observe React's dev commit instrumentation without shipping counters in the app.
  await page.addInitScript(() => {
    (window as any).cardRenders = [];
    let previous = new WeakSet<object>();
    (window as any)["__REACT_DEVTOOLS_GLOBAL_HOOK__"] = {
      supportsFiber: true,
      renderers: new Map(),
      inject: () => 1,
      onCommitFiberRoot: (_id: number, root: any) => {
        const current = new WeakSet<object>();
        const visit = (fiber: any) => {
          if (!fiber) return;
          current.add(fiber);
          // Bailouts reuse fibers whose old PerformedWork flag is still set.
          if (!previous.has(fiber) && fiber.type?.name === "ItemCard" && (fiber.flags & 1)) (window as any).cardRenders.push(fiber.memoizedProps.dragId);
          visit(fiber.child);
          visit(fiber.sibling);
        };
        visit(root.current);
        previous = current;
      },
      onCommitFiberUnmount: () => {},
    };
  });
  const fixture = await guestItem(page);
  // Real server records, not a mocked board. APIRequestContext bypasses browser routing.
  for (let batch = 0; batch < 10; batch++) await Promise.all(Array.from({ length: 10 }, (_, i) =>
    page.request.post("/api/items", { data: { id: nanoid(), title: `Existing item ${batch * 10 + i}`, listId: fixture.listId } }).then((response) => expect(response.status()).toBe(201))));
  await page.goto(`/p/${fixture.projectId}?v=board`);
  const list = page.locator(`.td-list[data-list-id="${fixture.listId}"]`);
  await expect(list.locator(".td-card")).toHaveCount(101);
  await page.waitForLoadState("networkidle");
  expect(await page.evaluate(() => (window as any).cardRenders.length)).toBeGreaterThanOrEqual(101);
  await page.evaluate(() => { (window as any).cardRenders = []; });
  await list.getByRole("button", { name: "Add an item", exact: true }).click();
  const input = list.getByRole("textbox", { name: /^New item in / });
  await input.fill("Only this card should render");
  await input.press("Enter");
  await input.press("Escape");
  const card = list.locator(".td-card").filter({ hasText: "Only this card should render" });
  await expect(card.locator(".td-card-id")).toHaveText(/\d+$/);
  await page.waitForLoadState("networkidle");
  const id = await card.getAttribute("data-drag-id");
  const renders = await page.evaluate(() => (window as any).cardRenders as string[]);
  await testInfo.attach("card-renders", { body: JSON.stringify({ existingCards: 101, renders, newItemId: id }), contentType: "application/json" });
  expect(renders.length).toBeGreaterThan(0);
  expect([...new Set(renders)]).toEqual([id]);
  // The stable delete callback must still target the current item and offer the normal Undo.
  await card.scrollIntoViewIfNeeded();
  await card.hover();
  await card.getByRole("button", { name: "Item options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(card).toHaveCount(0);
  await page.getByRole("button", { name: /^Undo/ }).click();
  await expect(card).toBeVisible();
  // Range selection reads current visible order even after acknowledgement and restoration.
  const cards = list.locator(".td-card");
  await cards.first().locator(".td-card-title").click({ modifiers: ["ControlOrMeta"] });
  await expect(cards.first()).toHaveAttribute("data-selected", "true");
  await cards.nth(2).locator(".td-card-title").click({ modifiers: ["Shift"] });
  await expect(list.locator('.td-card[data-selected="true"]')).toHaveCount(3);
  await page.keyboard.press("Escape");
  await expect(list.locator('.td-card[data-selected="true"]')).toHaveCount(0);
  await card.click();
  await expect(page.getByRole("dialog").first()).toBeVisible();
});

test("a queued create cannot write under a different account", async ({ page, context, browser }) => {
  const fixture = await guestItem(page);
  const reconnect = await apiOffline(context);
  await page.goto(`/p/${fixture.projectId}?v=board`);
  const list = page.locator(`.td-list[data-list-id="${fixture.listId}"]`);
  await list.getByRole("button", { name: "Add an item", exact: true }).click();
  const input = list.getByRole("textbox", { name: /^New item in / });
  await input.fill("Original account's saved item");
  await input.press("Enter");
  await input.press("Escape");
  await expect(page.getByRole("banner").getByRole("button", { name: /1 edit/ })).toBeVisible();
  const originalCookies = await context.cookies();
  const other = await browser.newContext({ baseURL: new URL(page.url()).origin });
  watch(other);
  // Sign into an unrelated guest account, then switch this tab's session cookie only.
  try {
    const otherPage = await other.newPage();
    await otherPage.goto("/");
    await expect(otherPage).toHaveURL(/\/p\//);
    await context.clearCookies();
    await context.addCookies(await other.cookies());
    let refused = 0;
    page.on("response", (response) => { if (response.request().method() === "POST" && new URL(response.url()).pathname === "/api/items" && response.status() === 401) refused++; });
    await reconnect();
    await expect(page.getByRole("banner").getByRole("button", { name: /couldn't sync/ })).toBeVisible();
    expect(refused).toBe(1);
    await context.clearCookies();
    await context.addCookies(originalCookies);
    expect((await serverItems(page, fixture.projectId)).some((item) => item.title === "Original account's saved item")).toBe(false);
    await page.getByRole("banner").getByRole("button", { name: /couldn't sync/ }).click();
    await page.getByRole("menuitem", { name: "Storage & sync settings" }).click();
    await expect(page.getByRole("textbox", { name: "Saved change", exact: true })).toHaveValue("Original account's saved item");
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect.poll(async () => (await serverItems(page, fixture.projectId)).filter((item) => item.title === "Original account's saved item").length).toBe(1);
  } finally { await other.close(); }
});

for (const scope of SCOPES) test(`pending ID stays stable on a phone in ${scope}`, async ({ page, context }) => {
  await useScope(page, scope);
  await page.setViewportSize({ width: 390, height: 844 });
  const fixture = await guestItem(page);
  await page.goto(`/p/${fixture.projectId}?v=board`);
  const reconnect = await apiOffline(context);
  const list = page.locator(`.td-list[data-list-id="${fixture.listId}"]`);
  await list.scrollIntoViewIfNeeded();
  await list.getByRole("button", { name: "Add an item", exact: true }).click();
  const input = list.getByRole("textbox", { name: /^New item in / });
  await input.fill("An item added on a phone");
  await input.press("Enter");
  await input.press("Escape");
  const card = list.locator(".td-card").filter({ hasText: "An item added on a phone" });
  await expect(card.locator(".td-card-id")).toHaveAttribute("aria-label", "Item ID pending");
  const before = await card.boundingBox();
  await page.screenshot({ path: `.tmp/shots/item-phone-pending-${scope}.png`, animations: "disabled" });
  await reconnect();
  await expect(card.locator(".td-card-id")).toHaveText(/\d+$/);
  expect(await card.boundingBox()).toEqual(before);
  await page.screenshot({ path: `.tmp/shots/item-phone-confirmed-${scope}.png`, animations: "disabled" });
});

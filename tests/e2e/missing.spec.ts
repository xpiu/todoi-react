import { expect, test, type Page, type Route } from "@playwright/test";
import { nanoid } from "nanoid";

import { checkA11y, freshProject, signIn, trackAccounts } from "./helpers";

// Honest states (DESIGN.md › States): an item link to something not on screen says why and offers a way
// on; details that are loading or failed are never shown as an item without comments; a session that cannot
// start says so.
const { own } = trackAccounts(test);

async function project(page: Page) {
  await signIn(page);
  return freshProject(page, "States");
}

test("item links explain missing and archived items, and Restore opens the item", async ({ page }) => {
  const p = await project(page);
  try {
    await page.goto(`/p/${p.projectId}?item=${nanoid()}`);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("This item doesn't exist");
    await dialog.getByRole("button", { name: "Close" }).first().click();
    await expect(page).not.toHaveURL(/item=/);

    const id = await p.item("Put away");
    expect((await page.request.patch(`/api/items/${id}`, { data: { archived: true } })).ok()).toBeTruthy();
    await page.goto(`/p/${p.projectId}?item=${id}`);
    await expect(dialog).toContainText("“Put away” is archived");
    await dialog.getByRole("button", { name: "Restore" }).click();
    await expect(page.getByRole("dialog", { name: "Put away", exact: true })).toBeVisible();
    await expect(page.locator(".td-toast")).toContainText("Restored “Put away”");
  } finally {
    await p.cleanup();
  }
});

test("a details failure is said where comments and files would be, and Retry loads them", async ({ page }) => {
  const p = await project(page);
  try {
    const id = await p.item("Details pending");
    await page.route("**/api/items/*/details", (route) => route.abort());
    await page.goto(`/p/${p.projectId}?item=${id}`);
    const notice = page.getByText("Couldn't load comments, files and links.");
    await expect(notice).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /^Watch/ })).toHaveCount(0);
    await page.unroute("**/api/items/*/details");
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(notice).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Watch/ })).toBeVisible();
  } finally {
    await p.cleanup();
  }
});

test("details still loading are announced as a status, and the overlay stays axe-clean", async ({ page }) => {
  const p = await project(page);
  try {
    const id = await p.item("Details loading");
    const held: Route[] = [];
    await page.route("**/api/items/*/details", (route) => void held.push(route));
    await page.goto(`/p/${p.projectId}?item=${id}`);
    await expect(page.getByRole("status").filter({ hasText: "Loading comments, files and links" })).toBeAttached();
    await checkA11y(page, "details loading");
    await Promise.all(held.map((route) => route.continue()));
    await page.unroute("**/api/items/*/details");
    await expect(page.getByRole("button", { name: /^Watch/ })).toBeVisible();
  } finally {
    await p.cleanup();
  }
});

test("a guest session that cannot start says so, and Try again opens the workspace", async ({ page }) => {
  await page.route("**/api/auth/**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Todoi is starting up", code: "unavailable", requestId: "test" }) }));
  await page.goto("/inbox");
  await expect(page.getByText("Couldn't open your workspace")).toBeVisible();
  await page.screenshot({ path: ".tmp/test-results/missing-session-failed.png" });
  await page.unroute("**/api/auth/**");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("button", { name: /Inbox/ }).first()).toBeVisible();
  await expect(page.getByText("Couldn't open your workspace")).toHaveCount(0);
  // The guest that Try again created is this test's to remove.
  const me = await (await page.request.get("/api/me")).json() as { id: string };
  own(me.id);
});

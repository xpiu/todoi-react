import { expect, test } from "@playwright/test";
import { nanoid } from "nanoid";

import type { ProjectDetail } from "../../src/client/data/api";
import { seedProjectId, signIn, trackAccounts } from "./helpers";

// Honest states (DESIGN.md › States): an item link to something not on screen says why and offers a way
// on; a details failure is never shown as an item without comments; a session that cannot start says so.
const { own } = trackAccounts(test);

async function project(page: import("@playwright/test").Page) {
  await signIn(page);
  const seed = await (await page.request.get(`/api/projects/${await seedProjectId(page)}`)).json() as ProjectDetail;
  const projectId = nanoid();
  expect((await page.request.post("/api/projects", { data: { id: projectId, groupId: seed.groupId, name: `States ${projectId.slice(0, 6)}`, lists: [["To-do", "TODO"]] } })).status()).toBe(201);
  const listId = ((await (await page.request.get(`/api/projects/${projectId}`)).json()) as ProjectDetail).lists[0]!.id;
  const item = async (title: string) => {
    const id = nanoid();
    expect((await page.request.post("/api/items", { data: { id, title, listId } })).status()).toBe(201);
    return id;
  };
  return { projectId, item, cleanup: async () => expect([204, 404]).toContain((await page.request.delete(`/api/archive/projects/${projectId}`)).status()) };
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

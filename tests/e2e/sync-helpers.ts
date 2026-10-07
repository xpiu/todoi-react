import { expect, type BrowserContext, type Page } from "@playwright/test";
import { nanoid } from "nanoid";

import type { Item } from "../../src/client/data/api";

export async function guestItem(page: Page, title = "Sync fixture") {
  await page.goto("/");
  await expect(page).toHaveURL(/\/p\//);
  const projectId = page.url().split("/p/")[1]!.split("?")[0]!;
  const project = await (await page.request.get(`/api/projects/${projectId}`)).json() as { lists: Array<{ id: string; statusRole: string | null }> };
  const listId = project.lists.find((list) => list.statusRole !== "DONE")!.id;
  const id = nanoid();
  expect((await page.request.post("/api/items", { data: { id, title, listId } })).status()).toBe(201);
  await page.goto(`/p/${projectId}?v=list`);
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  return { projectId, listId, id };
}

export async function serverItems(page: Page, projectId: string) {
  return (await (await page.request.get(`/api/items?projectId=${projectId}`)).json()) as Item[];
}

export const itemCheckbox = (page: Page, id: string, done = false) => page.locator(`[data-drag-id="${id}"]`).getByRole("checkbox", { name: done ? "Mark not done" : "Mark done", exact: true }).first();

export async function editTitle(page: Page, title: string) {
  await page.getByRole("dialog").getByTitle("Click to edit title").click();
  const input = page.getByRole("textbox", { name: "Item title", exact: true });
  await input.fill(title);
  await input.press("Enter");
}

/** Keep the dev shell available while every API call fails, including after a real reload/new tab.
 * This checks queue durability rather than service-worker shell caching (outside this change).
 * APIRequestContext bypasses browser routing, so it can independently verify server records.
 */
export async function apiOffline(context: BrowserContext) {
  const offlineFlag = "todoi-e2e-api-offline";
  await context.addInitScript((key) => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => localStorage.getItem(key) !== "true" });
  }, offlineFlag);
  await context.route("**/api/**", (route) => route.abort("internetdisconnected"));
  for (const page of context.pages()) await page.evaluate((key) => {
    localStorage.setItem(key, "true");
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => localStorage.getItem(key) !== "true" });
    window.dispatchEvent(new Event("offline"));
  }, offlineFlag);
  return async () => {
    await context.unroute("**/api/**");
    for (const page of context.pages()) if (!page.isClosed()) await page.evaluate((key) => {
      localStorage.removeItem(key);
      window.dispatchEvent(new Event("online"));
    }, offlineFlag);
  };
}

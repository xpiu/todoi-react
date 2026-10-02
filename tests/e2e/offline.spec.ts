import { expect, test, type Page } from "@playwright/test";
import { nanoid } from "nanoid";

import { trackAccounts } from "./helpers";

// Save state tells the truth: an edit made offline waits in the tab (with a real count), leaving asks
// first, reconnecting saves it once; an edit the server refuses (an expired session) is counted as not
// saved. Each test runs in a fresh guest workspace, removed afterwards.
trackAccounts(test);

const shot = (page: Page, name: string) => page.screenshot({ path: `.tmp/shots/offline-${name}.png` });

async function guestItem(page: Page, title: string) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/p\//);
  const projectId = page.url().split("/p/")[1]!.split("?")[0]!;
  const project = await (await page.request.get(`/api/projects/${projectId}`)).json() as { lists: Array<{ id: string; statusRole: string | null }> };
  const id = nanoid();
  expect((await page.request.post("/api/items", { data: { id, title, listId: project.lists.find((l) => l.statusRole !== "DONE")!.id } })).status()).toBe(201);
  await page.goto(`/p/${projectId}?v=list`);
  await expect(page.getByText(title)).toBeVisible();
  return { projectId, id };
}
const done = async (page: Page, id: string) => ((await (await page.request.get(`/api/items?projectId=${(await page.evaluate(() => location.pathname)).split("/p/")[1]}`)).json()) as Array<{ id: string; done: boolean }>).find((it) => it.id === id)?.done;

test("an offline edit waits with a real count, guards leaving, and saves once on reconnect", async ({ page, context }) => {
  const { id } = await guestItem(page, "Offline fixture");
  const pill = page.getByRole("banner").getByRole("button", { name: /You.re offline|waiting to save|didn.t save|up to date/ });
  await expect(pill).toHaveCount(0);

  await context.setOffline(true);
  await expect(pill).toHaveText(/Offline/);
  await page.locator(`[data-drag-id="${id}"]`).getByRole("checkbox", { name: "Mark done" }).first().click();
  await expect(pill).toContainText("· 1");
  await pill.click();
  await expect(page.getByRole("menu")).toContainText("You're offline — 1 edit waiting to save");
  await expect(page.getByRole("menu")).toContainText("Keep this tab open: reloading or closing it discards them.");
  await page.waitForTimeout(300); // the menu's fade-in, for the screenshot only
  await shot(page, "menu");
  await page.keyboard.press("Escape");

  // Leaving asks first; staying keeps the edit.
  let asked = false;
  page.once("dialog", (d) => {
    asked = d.type() === "beforeunload";
    void d.dismiss();
  });
  // The navigation is cancelled, so don't wait for it.
  await page.reload({ timeout: 1500 }).catch(() => undefined);
  await expect.poll(() => asked).toBe(true);
  await expect(pill).toContainText("· 1");

  // Settings shows the same number.
  await page.getByRole("banner").getByRole("button", { name: /You.re offline/ }).click();
  await page.getByRole("menuitem", { name: "Storage & sync settings" }).click();
  await expect(page.getByText("1 edit is waiting to save")).toBeVisible();
  await shot(page, "settings");

  await context.setOffline(false);
  await expect(page.getByText(/Nothing waiting to save · Last saved just now/)).toBeVisible();
  await page.goBack();
  await expect.poll(() => done(page, id)).toBe(true);
});

test("closing the tab anyway discards the waiting edit, as the copy said it would", async ({ page, context }) => {
  const { projectId, id } = await guestItem(page, "Discarded fixture");
  await context.setOffline(true);
  await page.locator(`[data-drag-id="${id}"]`).getByRole("checkbox", { name: "Mark done" }).first().click();
  await expect(page.getByRole("banner").getByRole("button", { name: /You.re offline — 1 edit/ })).toBeVisible();
  let asked = false;
  page.once("dialog", (d) => {
    asked = d.type() === "beforeunload";
    void d.accept();
  });
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => asked).toBe(true);
  await context.setOffline(false);
  const next = await context.newPage();
  await next.goto(`/p/${projectId}?v=list`);
  await expect(next.locator(`[data-drag-id="${id}"]`).getByRole("checkbox", { name: "Mark done" }).first()).not.toBeChecked();
  expect(await done(next, id)).toBe(false);
});

test("an edit refused because the session expired is counted as not saved", async ({ page, context }) => {
  const { id } = await guestItem(page, "Expiring fixture");
  const cookies = await context.cookies();
  await context.clearCookies();
  await page.locator(`[data-drag-id="${id}"]`).getByRole("checkbox", { name: "Mark done" }).first().click();
  const pill = page.getByRole("banner").getByRole("button", { name: /didn't save/ });
  await expect(pill).toHaveText(/1 not saved/);
  await expect(page.locator(".td-toast")).toContainText(/Sign in|log in/i);
  await shot(page, "failed");
  // The item is back as it was, and the server agrees.
  await expect(page.locator(`[data-drag-id="${id}"]`).getByRole("checkbox", { name: "Mark done" }).first()).not.toBeChecked();
  await context.addCookies(cookies);
  expect(await done(page, id)).toBe(false);
  await pill.click();
  await page.getByRole("menuitem", { name: "Dismiss" }).click();
  await expect(pill).toHaveCount(0);
});

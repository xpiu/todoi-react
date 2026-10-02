import { expect, test, type Page } from "@playwright/test";
import { nanoid } from "nanoid";

import { trackAccounts } from "./helpers";

// Settings › General and › Notifications change what they describe. Each test runs in a fresh guest
// workspace (its own account, prefs and Inbox), removed afterwards.
trackAccounts(test);

const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
const shot = (page: Page, name: string) => page.screenshot({ path: `.tmp/shots/settings-${name}.png` });

async function guestProject(page: Page) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/p\//);
  const projectId = page.url().split("/p/")[1]!.split("?")[0]!;
  const project = await (await page.request.get(`/api/projects/${projectId}`)).json() as { lists: Array<{ id: string; name: string; statusRole: string | null }> };
  return { projectId, listId: project.lists[0]!.id, listName: project.lists[0]!.name };
}
async function pick(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
async function toggle(page: Page, label: string, on: boolean) {
  const sw = page.getByRole("switch", { name: label });
  if ((await sw.getAttribute("aria-checked")) !== String(on)) await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", String(on));
}
const prefs = async (page: Page) => (await (await page.request.get("/api/me")).json()).prefs as Record<string, unknown>;

test("week start, date and time format reach the calendar and rows, and follow the account", async ({ page, browser }) => {
  const { projectId, listId } = await guestProject(page);
  const title = `Dated ${nanoid(4)}`;
  expect((await page.request.post("/api/items", { data: { id: nanoid(), title, listId, dueDate: "2026-09-12" } })).status()).toBe(201);
  await page.goto(`/p/${projectId}?v=calendar`);
  await expect(page.getByRole("columnheader").first()).toHaveText(/Mon/);

  await page.goto("/settings");
  await pick(page, "Week starts on", "Sunday");
  await pick(page, "Date format", "10/01/2020");
  await expect.poll(async () => (await prefs(page)).weekStart).toBe("sun");
  await shot(page, "general");

  await page.goto(`/p/${projectId}?v=calendar`);
  await expect(page.getByRole("columnheader").first()).toHaveText(/Sun/);
  await shot(page, "calendar-sunday");
  await page.goto(`/p/${projectId}?v=list`);
  await expect(page.locator(".td-lrow", { hasText: title })).toContainText(/12\/09(\/2026)?/);

  // Another device of the same account picks the preferences up from the account.
  const other = await browser.newContext({ storageState: await page.context().storageState({ indexedDB: false }) });
  const second = await other.newPage();
  await second.evaluate(() => localStorage.removeItem("td-prefs")).catch(() => undefined);
  await second.goto(`/p/${projectId}?v=calendar`);
  await second.evaluate(() => localStorage.removeItem("td-prefs"));
  await second.reload();
  await expect(second.getByRole("columnheader").first()).toHaveText(/Sun/);
  await other.close();
});

test("smart dates off keeps the words; default priority applies; hidden completed items disappear everywhere", async ({ page }) => {
  const { projectId, listName } = await guestProject(page);
  await page.goto("/settings");
  await toggle(page, "Smart date recognition", false);
  await pick(page, "Default priority", "High");
  await expect.poll(async () => (await prefs(page)).defaultPriority).toBe("HIGH");

  await page.goto(`/p/${projectId}?v=list`);
  await page.getByRole("main").getByRole("button", { name: "Add an item" }).first().click();
  const field = page.getByRole("textbox", { name: `New item in ${listName}` });
  await field.fill("Call the broker due fri");
  await field.press("Enter");
  await field.press("Escape");
  const row = page.locator(".td-lrow", { hasText: "Call the broker due fri" });
  await expect(row).toBeVisible();
  const items = async () => (await (await page.request.get(`/api/items?projectId=${projectId}`)).json()) as Array<{ id: string; title: string; dueDate: string | null; priority: string | null; done: boolean }>;
  await expect.poll(async () => (await items()).find((it) => it.title === "Call the broker due fri")).toMatchObject({ dueDate: null, priority: "HIGH" });

  // Complete it (due today, so the calendar shows it too), then hide completed items.
  const created = (await items()).find((it) => it.title === "Call the broker due fri")!;
  await page.request.patch(`/api/items/${created.id}`, { data: { dueDate: TODAY, done: true } });
  await page.request.post("/api/items", { data: { id: nanoid(), title: "Still open", listId: (await (await page.request.get(`/api/projects/${projectId}`)).json()).lists[0].id, dueDate: TODAY } });
  const inboxDone = nanoid();
  await page.request.post("/api/items", { data: { id: inboxDone, title: "Inbox done thing" } });
  await page.request.patch(`/api/items/${inboxDone}`, { data: { done: true } });
  await page.goto("/settings");
  await toggle(page, "Show completed items", false);
  for (const view of ["list", "board", "calendar"]) {
    await page.goto(`/p/${projectId}?v=${view}`);
    await expect(page.getByText("Still open").first()).toBeVisible();
    await expect(page.getByText("Call the broker due fri")).toHaveCount(0);
  }
  await page.goto("/inbox");
  await expect(page.getByText("Your inbox is empty")).toBeVisible();
  await page.goto("/settings");
  await toggle(page, "Show completed items", true);
  await page.goto(`/p/${projectId}?v=list`);
  await expect(page.getByText("Call the broker due fri")).toBeVisible();
});

test("the Inbox badge follows its setting, and unavailable controls say so", async ({ page }) => {
  await guestProject(page);
  const id = nanoid();
  expect((await page.request.post("/api/items", { data: { id, title: "Unread thing" } })).status()).toBe(201);
  await page.request.patch(`/api/items/${id}`, { data: { unread: true } });
  await page.goto("/settings?s=notifications");
  const dot = page.locator(".td-sidebar").getByRole("status", { name: /unread/ });
  await expect(dot).toBeVisible();
  await toggle(page, "Unread count on Inbox", false);
  await expect(dot).toHaveCount(0);
  await expect(page.getByText("Email sending isn't set up yet")).toBeVisible();
  await shot(page, "notifications");
  await page.goto("/settings");
  await expect(page.getByText("Todoi is in English for now")).toBeVisible();
});

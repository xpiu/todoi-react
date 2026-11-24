import { expect, test as base, type Page } from "@playwright/test";

import type { Item } from "../../src/client/data/api";
import { freshProject, signIn, type FreshProject } from "./helpers";

// The calendar's "No date" tray (DESIGN.md › Views › Calendar): open items without a due date beside the
// Month and Week grids. A tray row dragged onto a day gets that due date; a chip dragged onto the tray loses
// its due date and time (the start stays); shift+D opens the due-date picker on a row or a chip. Each change
// is one toast with Undo. A fresh, empty project keeps the cells and the tray free of seed items.
const test = base.extend<{ fixture: FreshProject }>({
  fixture: async ({ page }, use) => {
    await signIn(page);
    const f = await freshProject(page, "Tray");
    try {
      await use(f);
    } finally {
      await f.cleanup();
    }
  },
});

/** This month's day `d` in the browser's zone (Europe/Brussels, from the Playwright config). */
const day = (d: number) => `${new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date()).slice(0, 8)}${String(d).padStart(2, "0")}`;
async function itemOf(page: Page, f: FreshProject, id: string) {
  return ((await (await page.request.get(`/api/items?projectId=${f.projectId}`)).json()) as Item[]).find((x) => x.id === id)!;
}
const datesOf = async (page: Page, f: FreshProject, id: string) => {
  const it = await itemOf(page, f, id);
  return `${it.startDate} → ${it.dueDate} ${it.dueTime ?? ""}`.trim();
};

test("a tray row dragged onto a day gets that due date, a chip dragged onto the tray loses it, each with Undo", async ({ page, fixture: f }) => {
  const undated = await f.item("Undated tray item");
  const dated = await f.item("Dated chip item", { startDate: day(18), dueDate: day(20), dueTime: "09:30" });
  await f.item("Done undated item", { status: "DONE" });
  await page.goto(`/p/${f.projectId}?v=calendar`);
  const tray = page.getByRole("complementary", { name: "Items without a due date" });
  await expect(tray).toBeVisible();
  await expect(page.getByRole("button", { name: /^No date/ })).toHaveAttribute("aria-expanded", "true");
  // Open items only: the done one stays out.
  await expect(tray.getByRole("listitem")).toHaveCount(1);
  await expect(tray).not.toContainText("Done undated item");

  await tray.getByRole("button", { name: /^Undated tray item/ }).dragTo(page.locator(`.td-calendar-cell[data-iso="${day(12)}"]`));
  await expect.poll(() => datesOf(page, f, undated)).toBe(`null → ${day(12)}`);
  await expect(page.locator(".td-calendar-chip", { hasText: "Undated tray item" })).toBeVisible();
  await expect(tray).toContainText("No items without a date");
  let toast = page.locator(".td-toast").last();
  await expect(toast).toContainText("Due date set to");
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => datesOf(page, f, undated)).toBe("null → null");
  await expect(tray.getByRole("listitem")).toHaveCount(1);

  // A chip onto the tray: the due date and its time go, the start stays.
  await page.locator(".td-calendar-span", { hasText: "Dated chip item" }).first().dragTo(tray);
  await expect.poll(() => datesOf(page, f, dated)).toBe(`${day(18)} → null`);
  await expect(tray.getByRole("listitem")).toHaveCount(2);
  toast = page.locator(".td-toast").last();
  await expect(toast).toContainText("Due date cleared · “Dated chip item”");
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => datesOf(page, f, dated)).toBe(`${day(18)} → ${day(20)} 09:30`);
});

test("shift+D opens the due-date picker on a tray row and on a chip; Clear sends the chip to the tray", async ({ page, fixture: f }) => {
  const undated = await f.item("Keyboard tray item");
  const chip = await f.item("Keyboard chip item", { dueDate: day(21) });
  await page.goto(`/p/${f.projectId}?v=calendar`);
  const tray = page.getByRole("complementary", { name: "Items without a due date" });
  const row = tray.getByRole("button", { name: /^Keyboard tray item/ });
  await row.focus();
  await page.keyboard.press("Shift+D");
  const picker = page.getByRole("dialog", { name: "Due date" });
  await expect(picker).toBeVisible();
  // Due only: no start field, no time.
  await expect(picker.getByRole("textbox", { name: "Start date" })).toHaveCount(0);
  await picker.getByRole("textbox", { name: "Due date" }).fill(day(9));
  await page.keyboard.press("Enter");
  await expect.poll(() => datesOf(page, f, undated)).toBe(`null → ${day(9)}`);
  await expect(picker).toHaveCount(0);
  await expect(page.locator(".td-calendar-view").getByRole("status")).toContainText("Due date set to");
  // The tray is empty now: focus lands on the header button.
  await expect(page.getByRole("button", { name: /^No date/ })).toBeFocused();

  await page.locator(".td-calendar-chip", { hasText: "Keyboard chip item" }).focus();
  await page.keyboard.press("Shift+D");
  await expect(picker).toBeVisible();
  await picker.getByRole("button", { name: "Clear", exact: true }).click();
  await expect.poll(() => datesOf(page, f, chip)).toBe("null → null");
  await expect(tray.getByRole("button", { name: /^Keyboard chip item/ })).toBeVisible();
  await expect(page.locator(`.td-calendar-cell[data-iso="${day(21)}"]`)).toBeFocused();

  // The tray's open state is per device: closed stays closed after a reload.
  await page.getByRole("button", { name: /^No date/ }).click();
  await expect(tray).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: /^No date/ })).toHaveAttribute("aria-expanded", "false");
  await expect(tray).toHaveCount(0);
});

import { expect, test as base, type Page } from "@playwright/test";
import { nanoid } from "nanoid";

import type { Item, ProjectDetail } from "../../src/client/data/api";
import { seedProjectId, signIn } from "./helpers";

// Item dates (DESIGN.md › Dates): the API refuses days and times that do not exist and a start after the
// due; a calendar drag moves an item's whole range and one Undo puts both dates back; today turns over at
// midnight in an open tab. A fresh, empty project keeps the calendar cells free of seed chips.
type Fixture = { projectId: string; listId: string; item: (title: string, dates: Partial<Pick<Item, "startDate" | "dueDate" | "dueTime">>) => Promise<string> };
const test = base.extend<{ fixture: Fixture }>({
  fixture: async ({ page }, use) => {
    await signIn(page);
    const seed = await (await page.request.get(`/api/projects/${await seedProjectId(page)}`)).json() as ProjectDetail;
    const projectId = nanoid();
    expect((await page.request.post("/api/projects", { data: { id: projectId, groupId: seed.groupId, name: `Dates ${projectId.slice(0, 6)}`, lists: [["To-do", "TODO"]] } })).status()).toBe(201);
    try {
      const listId = ((await (await page.request.get(`/api/projects/${projectId}`)).json()) as ProjectDetail).lists[0]!.id;
      const item = async (title: string, dates: object) => {
        const id = nanoid();
        expect((await page.request.post("/api/items", { data: { id, title, listId, ...dates } })).status()).toBe(201);
        return id;
      };
      await use({ projectId, listId, item });
    } finally {
      expect([204, 404]).toContain((await page.request.delete(`/api/archive/projects/${projectId}`)).status());
    }
  },
});

/** This month's day `d` in the browser's zone (Europe/Brussels, from the Playwright config). */
const day = (d: number) => `${new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date()).slice(0, 8)}${String(d).padStart(2, "0")}`;
async function datesOf(page: Page, f: Fixture, id: string) {
  const it = ((await (await page.request.get(`/api/items?projectId=${f.projectId}`)).json()) as Item[]).find((x) => x.id === id)!;
  return `${it.startDate} → ${it.dueDate}`;
}

test("the API refuses impossible dates and times and a start after the due, naming the field", async ({ page, fixture: f }) => {
  const id = await f.item("Validated", { startDate: "2026-10-12", dueDate: "2026-10-14" });
  for (const [body, field, message] of [
    [{ dueDate: "2026-02-31" }, "dueDate", "Use a real date written as YYYY-MM-DD"],
    [{ dueTime: "29:99" }, "dueTime", "Use a time from 00:00 to 23:59"],
    [{ startDate: "2026-10-20" }, "startDate", "The start date must be on or before the due date"],
    [{ dueDate: "2026-10-01" }, "startDate", "The start date must be on or before the due date"],
  ] as const) {
    const response = await page.request.patch(`/api/items/${id}`, { data: body });
    expect(response.status(), JSON.stringify(body)).toBe(400);
    expect(await response.json()).toMatchObject({ error: message, code: "invalid", fields: { [field]: message } });
  }
  expect(await datesOf(page, f, id)).toBe("2026-10-12 → 2026-10-14");
  // A leap day exists; a saved time reads back as HH:MM.
  expect((await page.request.patch(`/api/items/${id}`, { data: { startDate: null, dueDate: "2028-02-29", dueTime: "23:59" } })).ok()).toBeTruthy();
  const it = ((await (await page.request.get(`/api/items?projectId=${f.projectId}`)).json()) as Item[]).find((x) => x.id === id)!;
  expect([it.dueDate, it.dueTime]).toEqual(["2028-02-29", "23:59"]);
});

test("a calendar drag moves an item's whole range, and Undo restores both dates", async ({ page, fixture: f }) => {
  const chip = await f.item("Same-day chip", { startDate: day(20), dueDate: day(20) });
  const span = await f.item("Three-day span", { startDate: day(8), dueDate: day(10) });
  await page.goto(`/p/${f.projectId}?v=calendar`);
  const bar = page.locator(".td-calspan", { hasText: "Three-day span" }).first();
  await expect(bar).toBeVisible();

  // A chip whose start is its due stays a one-day item.
  await page.locator(".td-calchip", { hasText: "Same-day chip" }).dragTo(page.locator(`.td-calcell[data-iso="${day(22)}"]`));
  await expect.poll(() => datesOf(page, f, chip)).toBe(`${day(22)} → ${day(22)}`);
  await expect(page.locator(".td-calspan", { hasText: "Same-day chip" })).toHaveCount(0);

  // Grab the bar over its first day and drop it a week on: both ends move, the preview shows where.
  const grab = (await page.locator(`.td-calcell[data-iso="${day(8)}"]`).boundingBox())!;
  const b = (await bar.boundingBox())!;
  const target = (await page.locator(`.td-calcell[data-iso="${day(15)}"]`).boundingBox())!;
  await page.mouse.move(grab.x + grab.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 8 });
  await expect(page.locator(".td-calcell.is-drop")).toHaveCount(3);
  await page.mouse.up();
  await expect.poll(() => datesOf(page, f, span)).toBe(`${day(15)} → ${day(17)}`);
  const toast = page.locator(".td-toast").last();
  await expect(toast).toContainText("Moved “Three-day span” to");
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => datesOf(page, f, span)).toBe(`${day(8)} → ${day(10)}`);
});

test("an open tab's today turns over at midnight", async ({ page, fixture: f }) => {
  await f.item("Due on the 2nd", { dueDate: "2026-10-02" });
  await page.clock.install({ time: new Date("2026-10-02T23:59:00+02:00") });
  await page.goto(`/p/${f.projectId}?v=calendar`);
  const today = page.locator('.td-calcell[aria-current="date"]');
  const overdue = page.locator(".td-calchip", { hasText: "Due on the 2nd" }).locator(".td-calchip-ico");
  await expect(today).toHaveAttribute("data-iso", "2026-10-02");
  await expect(overdue).toHaveCount(0);
  await page.clock.runFor(2 * 60_000);
  await expect(today).toHaveAttribute("data-iso", "2026-10-03");
  await expect(overdue).toHaveCount(1);
});

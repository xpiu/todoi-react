import { expect, test as base, type Page } from "@playwright/test";
import { nanoid } from "nanoid";

import type { Item, ProjectDetail } from "../../src/client/data/api";
import { seedProjectId, signIn } from "./helpers";

// One weekly item, six occurrences, completed once from every surface: each must advance it exactly one
// week, say so in the same words, and undo the same way; the last one finishes it.
type Fixture = { projectId: string; id: string; title: string; created: string[]; doneListId: string };
const test = base.extend<{ fixture: Fixture }>({
  fixture: async ({ page }, use) => {
    await signIn(page);
    const projectId = await seedProjectId(page);
    const project = await (await page.request.get(`/api/projects/${projectId}`)).json() as ProjectDetail;
    const listId = project.lists.find((l) => !l.hidden && l.statusRole === "TODO")?.id ?? project.lists.find((l) => !l.hidden && l.statusRole !== "DONE")!.id;
    const doneListId = project.lists.find((l) => l.statusRole === "DONE")!.id;
    const id = nanoid(), title = `Recurring fixture ${id.slice(0, 6)}`;
    const created = [id];
    expect((await page.request.post("/api/items", { data: { id, title, listId, dueDate: TODAY } })).status()).toBe(201);
    expect((await page.request.patch(`/api/items/${id}`, { data: { repeatRule: { freq: "weekly", ends: { type: "after", count: 6 } } } })).ok()).toBeTruthy();
    try {
      await use({ projectId, id, title, created, doneListId });
    } finally {
      for (const x of created) expect([204, 404]).toContain((await page.request.delete(`/api/archive/items/${x}`)).status());
    }
  },
});

/** Today in the browser's zone (Europe/Brussels, from the Playwright config). */
const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
const plusWeeks = (n: number) => {
  const [y, m, d] = TODAY.split("-").map(Number);
  const x = new Date(Date.UTC(y!, m! - 1, d! + 7 * n));
  return x.toISOString().slice(0, 10);
};
const short = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

async function read(page: Page, f: Fixture) {
  const it = ((await (await page.request.get(`/api/items?projectId=${f.projectId}`)).json()) as Item[]).find((x) => x.id === f.id)!;
  return { dueDate: it.dueDate, repeatCount: it.repeatCount, done: it.done, status: it.status };
}

test("a recurring item advances identically from every surface, and Undo restores it", async ({ page, fixture: f }) => {
  const toast = page.locator(".td-toast");
  const row = () => page.locator(`[data-drag-id="${f.id}"]`);
  const expectAdvanced = async (n: number) => {
    await expect.poll(() => read(page, f)).toEqual({ dueDate: plusWeeks(n), repeatCount: n, done: false, status: "TODO" });
  };
  const expectToast = async (n: number) => {
    await expect(toast).toContainText(`Completed “${f.title}” — next due ${short(plusWeeks(n))}`);
    await expect(toast).toContainText(`${n} of 6`);
  };

  // 1. The row's checkbox; Undo puts the occurrence back, and checking again redoes it.
  await page.goto(`/p/${f.projectId}?v=list`);
  await row().getByRole("checkbox", { name: "Mark done" }).first().click();
  await expectToast(1);
  await page.screenshot({ path: ".tmp/test-results/completion-row-toast.png" });
  await expectAdvanced(1);
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(toast).toContainText("Undid: completed");
  await expect.poll(() => read(page, f)).toEqual({ dueDate: TODAY, repeatCount: 0, done: false, status: "TODO" });
  await row().getByRole("checkbox", { name: "Mark done" }).first().click();
  await expectAdvanced(1);

  // 2. The keyboard.
  await row().focus();
  await page.keyboard.press("d");
  await expectToast(2);
  await expectAdvanced(2);

  // 3. The overlay's Status picker: Done completes the occurrence like the checkbox.
  await page.goto(`/p/${f.projectId}?v=list&item=${f.id}`);
  await page.getByRole("dialog").getByRole("combobox", { name: "Status" }).click();
  await page.getByRole("option", { name: "Done" }).click();
  await expectToast(3);
  await page.screenshot({ path: ".tmp/test-results/completion-overlay-toast.png" });
  await expectAdvanced(3);
  await page.keyboard.press("Escape");

  // 4. The BulkBar.
  await page.goto(`/p/${f.projectId}?v=list`);
  await row().click({ modifiers: ["ControlOrMeta"] });
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(toast).toContainText("Marked 1 item done — 1 recurring item moved to the next date");
  await page.screenshot({ path: ".tmp/test-results/completion-bulk-toast.png" });
  await expectAdvanced(4);

  // 5. The calendar's day list (bring the due back to today so the day view shows it).
  expect((await page.request.patch(`/api/items/${f.id}`, { data: { dueDate: TODAY } })).ok()).toBeTruthy();
  await page.goto(`/p/${f.projectId}?v=calendar`);
  await page.getByRole("combobox", { name: "Calendar period" }).click();
  await page.getByRole("option", { name: "Day" }).click();
  await row().getByRole("checkbox", { name: "Mark done" }).first().click();
  await expect(toast).toContainText(`next due ${short(plusWeeks(1))}`);
  await expect(toast).toContainText("5 of 6");
  await expect.poll(() => read(page, f)).toEqual({ dueDate: plusWeeks(1), repeatCount: 5, done: false, status: "TODO" });

  // 6. The API, twice with the same precondition: the last occurrence finishes it once.
  for (let i = 0; i < 2; i++) {
    const r = await page.request.patch(`/api/items/${f.id}`, { data: { done: true, ifDue: plusWeeks(1) } });
    expect(r.ok()).toBeTruthy();
    const body = await r.json() as { occurrence: unknown };
    expect(body.occurrence).toEqual(i === 0 ? { from: plusWeeks(1), next: null, count: 6, ended: true } : null);
  }
  await expect.poll(() => read(page, f)).toEqual({ dueDate: plusWeeks(1), repeatCount: 6, done: true, status: "DONE" });

  // Reopening restores the Status it had.
  await page.goto(`/p/${f.projectId}?v=list`);
  await row().getByRole("checkbox", { name: "Mark not done" }).first().click();
  await expect.poll(() => read(page, f)).toEqual({ dueDate: plusWeeks(1), repeatCount: 6, done: false, status: "TODO" });
});

test("an item created in a Done list is done, and a Done Status is literal", async ({ page, fixture: f }) => {
  const id = nanoid();
  f.created.push(id);
  const made = await page.request.post("/api/items", { data: { id, title: `Done-list fixture ${id.slice(0, 6)}`, listId: f.doneListId } });
  expect(made.status()).toBe(201);
  expect(await made.json()).toMatchObject({ status: "DONE", done: true, priorStatus: null });
  const reopened = await (await page.request.patch(`/api/items/${id}`, { data: { done: false } })).json() as Item;
  expect(reopened).toMatchObject({ status: null, done: false });
  // Status Done on a recurring item finishes it without moving to the next occurrence.
  const literal = await (await page.request.patch(`/api/items/${f.id}`, { data: { status: "DONE" } })).json() as Item & { occurrence: unknown };
  expect(literal).toMatchObject({ status: "DONE", done: true, priorStatus: "TODO", dueDate: TODAY, repeatCount: 0, occurrence: null });
});

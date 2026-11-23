// List view: a subitem drags between its item's subitems (reorder) or onto another item's row (moves under it,
// one toast with Undo). Design: ui_kits/todoi/ListScreen.jsx · DESIGN.md › Drag & drop.
import { expect, test as base, type Locator, type Page } from "@playwright/test";
import { nanoid } from "nanoid";

import type { Item, ProjectDetail } from "../../src/client/data/api";
import { freshProject, signIn } from "./helpers";

type Fixture = { projectId: string; a: string; a1: string; a2: string; b: string };
const test = base.extend<{ fixture: Fixture }>({
  fixture: async ({ page }, use) => {
    await signIn(page);
    const own = await freshProject(page, "Subitem drag");
    const created: string[] = [];
    try {
      const project = await (await page.request.get(`/api/projects/${own.projectId}`)).json() as ProjectDetail;
      const listId = project.lists.find((l) => !l.hidden)!.id;
      const [a, a1, a2, b] = [nanoid(), nanoid(), nanoid(), nanoid()];
      for (const [id, title, parentItemId] of [[a, "Parent A", undefined], [a1, "First sub", a], [a2, "Second sub", a], [b, "Parent B", undefined]] as const) {
        expect((await page.request.post("/api/items", { data: { id, title, listId, parentItemId } })).status()).toBe(201);
        created.push(id);
      }
      await use({ projectId: own.projectId, a, a1, a2, b });
    } finally {
      for (const id of created.reverse()) await page.request.delete(`/api/archive/items/${id}`);
      await own.cleanup();
    }
  },
});

/** HTML5 drag from one row to a point on another (fraction of its height) */
async function drag(page: Page, from: Locator, to: Locator, frac: number) {
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await from.dispatchEvent("dragstart", { dataTransfer });
  const box = (await to.boundingBox())!;
  const at = { dataTransfer, clientX: box.x + box.width / 3, clientY: box.y + box.height * frac };
  await to.dispatchEvent("dragover", at);
  return async () => {
    await to.dispatchEvent("drop", at);
    // A moved subitem re-renders under its new parent, so the source row may be gone (the drop already ended the drag)
    await from.dispatchEvent("dragend", { dataTransfer }, { timeout: 1000 }).catch(() => {});
  };
}

test("a subitem reorders inside its item and moves onto another item's row, with Undo", async ({ page, fixture: f }) => {
  const subs = async (parent: string) => ((await (await page.request.get(`/api/items?projectId=${f.projectId}`)).json()) as Item[]).filter((x) => x.parentItemId === parent).sort((x, y) => x.position - y.position).map((x) => x.id);
  await page.goto(`/p/${f.projectId}?v=list`);
  const row = (id: string, parent?: string) => page.locator(`.td-list-row[data-drag-id="${parent ? `${parent}/${id}` : id}"]`);

  // Second sub above First sub: a line before it, then the new order
  let drop = await drag(page, row(f.a2, f.a), row(f.a1, f.a), 0.2);
  await expect(row(f.a1, f.a)).toHaveClass(/td-drop-before/);
  await drop();
  await expect.poll(() => subs(f.a)).toEqual([f.a2, f.a1]);

  // Its own parent takes no drop; another item's row rings and takes it
  drop = await drag(page, row(f.a1, f.a), row(f.a), 0.5);
  await expect(page.locator(".td-drop-into")).toHaveCount(0);
  drop = await drag(page, row(f.a1, f.a), row(f.b), 0.5);
  await expect(row(f.b)).toHaveClass(/td-drop-into/);
  await drop();
  await expect(page.getByRole("status").filter({ hasText: "Moved “First sub” under" })).toBeVisible();
  await expect.poll(() => subs(f.b)).toEqual([f.a1]);
  await expect(row(f.a1, f.b)).toBeVisible();

  await page.getByRole("button", { name: /^Undo/ }).click();
  await expect.poll(() => subs(f.b)).toEqual([]);
  await expect.poll(async () => (await subs(f.a)).sort()).toEqual([f.a1, f.a2].sort());
});

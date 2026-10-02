import { expect, test as base, type Page } from "@playwright/test";
import { nanoid } from "nanoid";

import type { GroupWithProjects, Item, ItemDetails, Label, ProjectDetail } from "../../src/client/data/api";
import { seedProjectId, signIn } from "./helpers";

// The seeded project (group MP, with Sam as an editor) is the source; a fresh project in another of the
// dev user's groups is the destination, where Sam is not a member and only one label name exists.
type Fixture = { source: ProjectDetail; listId: string; dest: ProjectDetail; destLabel: string; parent: string; child: string; stay: string; peer: string; labels: Label[] };
const test = base.extend<{ fixture: Fixture }>({
  fixture: async ({ page }, use) => {
    await signIn(page);
    const source = await (await page.request.get(`/api/projects/${await seedProjectId(page)}`)).json() as ProjectDetail;
    const groups = await (await page.request.get("/api/groups")).json() as GroupWithProjects[];
    const otherGroup = groups.find((g) => g.id !== source.groupId && g.ownerId === source.members.find((m) => m.role === "owner")?.userId) ?? groups.find((g) => g.id !== source.groupId)!;
    const labels = (await (await page.request.get(`/api/labels?projectId=${source.id}`)).json() as Label[]).slice(0, 2);
    expect(labels).toHaveLength(2);
    // A list of its own keeps the order checks independent of tests running in parallel.
    const listId = nanoid();
    expect((await page.request.post("/api/lists", { data: { id: listId, projectId: source.id, name: `Move source ${listId.slice(0, 6)}` } })).status()).toBe(201);
    const destId = nanoid(), destLabel = nanoid();
    const made = await page.request.post("/api/projects", { data: { id: destId, groupId: otherGroup.id, name: `Move target ${destId.slice(0, 6)}`, lists: [["Arrivals", null]] } });
    expect(made.status()).toBe(201);
    // Same name, different case: the move reuses it instead of creating a duplicate.
    expect((await page.request.post("/api/labels", { data: { id: destLabel, projectId: destId, name: labels[0]!.name.toUpperCase(), color: "teal" } })).status()).toBe(201);
    const parent = nanoid(), child = nanoid(), stay = nanoid(), peer = nanoid();
    const created: string[] = [];
    const everyone = source.members.map((m) => m.userId);
    try {
      for (const [id, parentItemId] of [[parent, undefined], [child, parent], [stay, undefined], [peer, undefined]] as const) {
        const response = await page.request.post("/api/items", { data: { id, title: `Move fixture ${id}`, listId, parentItemId, labelIds: labels.map((l) => l.id), assigneeIds: everyone } });
        expect(response.status()).toBe(201);
        created.push(id);
      }
      expect((await page.request.post(`/api/items/${parent}/relations`, { data: { targetId: stay, type: "blocked_by" } })).status()).toBe(201);
      expect((await page.request.post(`/api/items/${parent}/relations`, { data: { targetId: child, type: "related" } })).status()).toBe(201);
      expect((await page.request.post(`/api/items/${stay}/relations`, { data: { targetId: peer, type: "related" } })).status()).toBe(201);
      const dest = await (await page.request.get(`/api/projects/${destId}`)).json() as ProjectDetail;
      await use({ source, listId, dest, destLabel, parent, child, stay, peer, labels });
    } finally {
      for (const id of created.reverse()) expect([204, 404]).toContain((await page.request.delete(`/api/archive/items/${id}`)).status());
      expect([204, 404]).toContain((await page.request.delete(`/api/archive/projects/${destId}`)).status());
      expect([204, 404]).toContain((await page.request.delete(`/api/lists/${listId}`)).status());
    }
  },
});

/** Everything a move may touch, read back through the API. */
async function state(page: Page, f: Fixture, ids: string[]) {
  const all = [...(await (await page.request.get(`/api/items?projectId=${f.source.id}`)).json() as Item[]), ...(await (await page.request.get(`/api/items?projectId=${f.dest.id}`)).json() as Item[])];
  return Promise.all(ids.map(async (id) => {
    const it = all.find((x) => x.id === id)!;
    const details = await (await page.request.get(`/api/items/${id}/details`)).json() as ItemDetails;
    // Rank, not the raw number: re-inserting renumbers a list's positions without reordering it.
    const rank = all.filter((x) => x.listId === it.listId && x.parentItemId === it.parentItemId).sort((a, b) => a.position - b.position).findIndex((x) => x.id === id);
    return { id, projectId: it.projectId, listId: it.listId, parentItemId: it.parentItemId, keyNumber: it.keyNumber, rank, labelIds: [...it.labelIds].sort(), assigneeIds: [...it.assigneeIds].sort(), relations: details.relations.map((r) => `${r.type}:${r.itemId}`).sort() };
  }));
}

test("moving an item family to another group's project keeps it valid there, and Undo restores it exactly", async ({ page, fixture: f }) => {
  const ids = [f.parent, f.child, f.stay];
  const before = await state(page, f, ids);
  await page.goto(`/p/${f.source.id}?v=list&item=${f.parent}`);
  await page.getByRole("button", { name: "Item options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Move to project…" }).click();
  const picker = page.getByRole("dialog", { name: "Move to project" });
  await picker.getByRole("option", { name: new RegExp(f.dest.name) }).click();
  await expect(picker.getByRole("option", { name: "Arrivals" })).toBeVisible();
  await page.screenshot({ path: ".tmp/test-results/cross-project-move-picker.png" });
  await picker.getByRole("option", { name: "Arrivals" }).click();

  const toast = page.locator(".td-toast");
  await expect(toast).toContainText(`and 1 subitem to ${f.dest.name} › Arrivals`);
  await expect(toast).toContainText(new RegExp(`— now ${f.dest.keyPrefix}-\\d+, label “${f.labels[1]!.name}” added, 2 non-members unassigned, 1 relation to items left behind removed`));
  await page.screenshot({ path: ".tmp/test-results/cross-project-move-toast.png" });

  const after = await state(page, f, ids);
  const [parent, child] = after;
  for (const it of [parent!, child!]) {
    expect(it).toMatchObject({ projectId: f.dest.id, listId: f.dest.lists[0]!.id });
    expect(it.assigneeIds).toEqual([f.dest.members[0]!.userId]);
    expect(it.labelIds).toHaveLength(2);
    expect(it.labelIds).toContain(f.destLabel);
  }
  expect(parent!.parentItemId).toBeNull();
  expect(child!.parentItemId).toBe(f.parent);
  expect(new Set([parent!.keyNumber, child!.keyNumber]).size).toBe(2);
  expect(parent!.relations).toEqual([`related:${f.child}`]);
  expect(after[2]!.relations).toEqual([`related:${f.peer}`]);

  // The destination shows the family under its own key prefix (another tab keeps this page's history).
  const dest = await page.context().newPage();
  await dest.goto(`/p/${f.dest.id}?v=list`);
  await expect(dest.getByText(`Move fixture ${f.parent}`)).toBeVisible();
  await expect(dest.getByText(`${f.dest.keyPrefix}-${parent!.keyNumber}`, { exact: true }).first()).toBeVisible();
  await dest.screenshot({ path: ".tmp/test-results/cross-project-move-destination.png" });
  await dest.close();

  // Z undoes after the toast is gone: keys, labels, people, relations and position all come back.
  await page.keyboard.press("z");
  await expect(toast).toContainText("Undid: moved");
  await expect.poll(() => state(page, f, ids)).toEqual(before);
});

test("Undo on the move toast restores the family, and moved items keep their relations to each other", async ({ page, fixture: f }) => {
  const ids = [f.parent, f.child, f.stay, f.peer];
  const before = await state(page, f, ids);
  await page.goto(`/p/${f.source.id}?v=list`);
  // Select the parent and two related items (stay ↔ peer) and move them together.
  for (const id of [f.parent, f.stay, f.peer]) await page.locator(`[data-drag-id="${id}"]`).click({ modifiers: ["ControlOrMeta"] });
  await page.getByRole("button", { name: "Move to", exact: true }).click();
  await page.getByRole("menuitem", { name: "Move to another project…" }).click();
  const picker = page.getByRole("dialog", { name: "Move to project" });
  await picker.getByRole("option", { name: new RegExp(f.dest.name) }).click();
  await picker.getByRole("option", { name: "Arrivals" }).click();
  const toast = page.locator(".td-toast");
  await expect(toast).toContainText(`Moved 3 items and 1 subitem to ${f.dest.name} › Arrivals`);
  await page.screenshot({ path: ".tmp/test-results/cross-project-move-bulk-toast.png" });
  const after = await state(page, f, ids);
  expect(after.every((it) => it.projectId === f.dest.id)).toBe(true);
  // Every relation joined items that moved together, so none was dropped.
  expect(after.map((it) => it.relations)).toEqual(before.map((it) => it.relations));
  expect(new Set(after.map((it) => it.keyNumber)).size).toBe(4);

  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(toast).toContainText("Undid");
  await expect.poll(() => state(page, f, ids)).toEqual(before);
  // The label the move created in the destination is gone again; the destination's own label stays.
  const destLabels = await (await page.request.get(`/api/labels?projectId=${f.dest.id}`)).json() as Label[];
  expect(destLabels.map((l) => l.id)).toEqual([f.destLabel]);
  await page.screenshot({ path: ".tmp/test-results/cross-project-move-undone.png" });
});

import { expect, test as base } from "@playwright/test";
import { nanoid } from "nanoid";

import type { Item, ProjectDetail } from "../../src/client/data/api";
import { seedProjectId, signIn } from "./helpers";

type Fixture = { project: string; parent: string; child: string; deleted: string; archived: string; file: string };
const test = base.extend<{ fixture: Fixture }>({
  fixture: async ({ page }, use) => {
    await signIn(page);
    const seed = await (await page.request.get(`/api/projects/${await seedProjectId(page)}`)).json() as ProjectDetail;
    const project = nanoid(), parent = nanoid(), child = nanoid(), deleted = nanoid(), archived = nanoid();
    const made = await page.request.post("/api/projects", { data: { id: project, groupId: seed.groupId, name: `Lifecycle ${project}`, lists: [["Work", "TODO"]] } });
    expect(made.status()).toBe(201);
    const { lists } = await made.json() as { lists: Array<{ id: string }> };
    try {
      for (const id of [parent, child, deleted, archived]) {
        expect((await page.request.post("/api/items", { data: { id, listId: lists[0]!.id, title: `Lifecycle ${id}`, parentItemId: id === parent ? undefined : parent } })).status()).toBe(201);
      }
      expect((await page.request.delete(`/api/items/${deleted}`)).status()).toBe(204);
      expect((await page.request.patch(`/api/items/${archived}`, { data: { archived: true } })).ok()).toBeTruthy();
      expect((await page.request.post("/api/labels", { data: { id: nanoid(), projectId: project, name: "Lifecycle label", color: "blue" } })).status()).toBe(201);
      expect((await page.request.post("/api/saved-views", { data: { id: nanoid(), projectId: project, name: "Lifecycle view", definition: {} } })).status()).toBe(201);
      expect((await page.request.post(`/api/items/${child}/comments`, { data: { id: nanoid(), body: "Keep until permanent deletion" } })).status()).toBe(201);
      const upload = await page.request.post(`/api/items/${child}/attachments`, { multipart: { files: { name: "lifecycle.txt", mimeType: "text/plain", buffer: Buffer.from("lifecycle bytes") } } });
      expect(upload.status()).toBe(201);
      const [file] = await upload.json() as Array<{ id: string }>;
      await use({ project, parent, child, deleted, archived, file: file!.id });
    } finally {
      expect([204, 404]).toContain((await page.request.delete(`/api/archive/projects/${project}`)).status());
    }
  },
});

test("parent archive and trash inherit visibility without restoring independently removed children", async ({ page, fixture: f }) => {
  const liveIds = async () => (await (await page.request.get(`/api/items?projectId=${f.project}`)).json() as Item[]).map((it) => it.id).sort();
  await page.goto(`/p/${f.project}?v=list&item=${f.parent}`);
  await page.getByRole("button", { name: "Item options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Archive", exact: true }).click();
  await expect.poll(liveIds).toEqual([]);
  await page.goto(`/archive?project=${f.project}`);
  const archive = page.getByRole("list", { name: "Archive", exact: true });
  await expect(archive.getByRole("listitem")).toHaveCount(1);
  const archivedParent = archive.getByRole("listitem").filter({ hasText: `Lifecycle ${f.parent}` });
  await expect(archivedParent).toBeVisible();
  await archivedParent.getByRole("button", { name: "Restore", exact: true }).click();
  await expect.poll(liveIds).toEqual([f.parent, f.child].sort());
  await page.goto(`/p/${f.project}?v=list`);
  await page.locator(`[data-drag-id="${f.parent}"]`).focus();
  await page.keyboard.press("Backspace");
  await expect.poll(liveIds).toEqual([]);
  await page.goto(`/archive?project=${f.project}`);
  await page.getByRole("button", { name: /^Trash/ }).click();
  const trash = page.getByRole("list", { name: "Trash", exact: true });
  await expect(trash.getByRole("listitem")).toHaveCount(1);
  const trashedParent = trash.getByRole("listitem").filter({ hasText: `Lifecycle ${f.parent}` });
  await expect(trashedParent).toBeVisible();
  await trashedParent.getByRole("button", { name: "Restore", exact: true }).click();
  await expect.poll(liveIds).toEqual([f.parent, f.child].sort());
  await expect(trash.getByText(`Lifecycle ${f.deleted}`, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Archive/ }).click();
  await expect(archive.getByText(`Lifecycle ${f.archived}`, { exact: true })).toBeVisible();
  // Permanent parent deletion is still a separate, confirmed action and includes its descendants.
  expect((await page.request.delete(`/api/items/${f.parent}`)).status()).toBe(204);
  await page.reload();
  await page.getByRole("button", { name: /^Trash/ }).click();
  await trash.getByRole("button", { name: `More for Lifecycle ${f.parent}` }).click();
  await page.getByRole("menuitem", { name: "Delete forever", exact: true }).click();
  expect((await page.request.get(`/api/items/${f.parent}/details`)).status()).toBe(200);
  await trash.getByRole("button", { name: "Delete forever", exact: true }).click();
  await expect.poll(async () => (await page.request.get(`/api/items/${f.child}/details`)).status()).toBe(404);
  expect((await page.request.get(`/api/attachments/${f.file}/file`)).status()).toBe(404);
});

test("project restore preserves item state and failed permanent deletion remains retryable", async ({ page, fixture: f }) => {
  expect((await page.request.post(`/api/projects/${f.project}/archive`)).ok()).toBeTruthy();
  expect(await (await page.request.get(`/api/items?projectId=${f.project}`)).json()).toEqual([]);
  await page.goto("/archive");
  const row = page.getByRole("listitem").filter({ hasText: `Lifecycle ${f.project}` });
  await row.getByRole("button", { name: "Restore", exact: true }).click();
  await expect.poll(async () => (await (await page.request.get(`/api/items?projectId=${f.project}`)).json() as Item[]).map((it) => it.id).sort()).toEqual([f.parent, f.child].sort());
  expect((await page.request.delete(`/api/projects/${f.project}`)).status()).toBe(204);
  await page.reload();
  await page.getByRole("button", { name: /^Trash/ }).click();
  await page.route(`**/api/archive/projects/${f.project}`, (route) => route.fulfill({ status: 422, json: { error: "Simulated deletion failure" } }));
  const confirmDelete = async () => {
    await row.getByRole("button", { name: `More for Lifecycle ${f.project}` }).click();
    await page.getByRole("menuitem", { name: "Delete forever", exact: true }).click();
    await row.getByRole("button", { name: "Delete forever", exact: true }).click();
  };
  await confirmDelete();
  await expect(page.getByRole("status").filter({ hasText: "Simulated deletion failure" })).toBeVisible();
  await expect(row).toBeVisible();
  expect((await page.request.get(`/api/items/${f.child}/details`)).status()).toBe(200);
  await page.unroute(`**/api/archive/projects/${f.project}`);
  await confirmDelete();
  await expect(row).toHaveCount(0);
  expect((await page.request.get(`/api/attachments/${f.file}/file`)).status()).toBe(404);
  expect((await page.request.get(`/api/projects/${f.project}`)).status()).toBe(404);
});

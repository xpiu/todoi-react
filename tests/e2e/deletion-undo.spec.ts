import { expect, test as base } from "@playwright/test";
import { nanoid } from "nanoid";

import type { Item, ItemDetails, ProjectDetail } from "../../src/client/data/api";
import { freshProject, signIn } from "./helpers";

type Fixture = { projectId: string; parent: string; child: string; sibling: string; other: string };
const test = base.extend<{ fixture: Fixture }>({
  fixture: async ({ page }, use) => {
    await signIn(page);
    const ownProject = await freshProject(page, "Deletion undo");
    const projectId = ownProject.projectId;
    const parent = nanoid(), child = nanoid(), sibling = nanoid(), other = nanoid();
    const created: string[] = [];
    const files: string[] = [];
    try {
      const project = await (await page.request.get(`/api/projects/${projectId}`)).json() as ProjectDetail;
      const listId = project.lists.find((l) => !l.hidden && l.statusRole !== "DONE")!.id;
      const labelId = nanoid();
      expect((await page.request.post("/api/labels", { data: { id: labelId, projectId, name: "Undo metadata", color: "blue" } })).status()).toBe(201);
      for (const [id, parentItemId] of [[parent, undefined], [child, parent], [sibling, parent], [other, undefined]] as const) {
        const response = await page.request.post("/api/items", { data: { id, title: `Undo fixture ${id}`, listId, parentItemId, description: "Keep **this description**", priority: "HIGH", startDate: "2026-10-02", dueDate: "2026-10-09", dueTime: "14:30", labelIds: [labelId], assigneeIds: [project.members[0]!.userId] } });
        expect(response.status()).toBe(201);
        created.push(id);
        expect((await page.request.patch(`/api/items/${id}`, { data: { repeatRule: { freq: "weekly" }, repeatCount: 2 } })).ok()).toBeTruthy();
        expect((await page.request.post(`/api/items/${id}/comments`, { data: { id: nanoid(), body: "Keep this comment" } })).status()).toBe(201);
        expect((await page.request.put(`/api/items/${id}/watch`, { data: { watching: true } })).ok()).toBeTruthy();
        const uploaded = await page.request.post(`/api/items/${id}/attachments`, { multipart: { files: { name: "undo.txt", mimeType: "text/plain", buffer: Buffer.from("keep these bytes") } } });
        expect(uploaded.status()).toBe(201);
        const [file] = await uploaded.json() as Array<{ id: string }>;
        files.push(file!.id);
        expect((await page.request.patch(`/api/items/${id}`, { data: { cover: { attachmentId: file!.id } } })).ok()).toBeTruthy();
      }
      expect((await page.request.post(`/api/items/${parent}/relations`, { data: { targetId: other, type: "related" } })).status()).toBe(201);
      await use({ projectId, parent, child, sibling, other });
    } finally {
      // Fixture teardown has its own timeout, including when the browser test times out.
      for (const id of files) expect((await page.request.delete(`/api/attachments/${id}`)).status()).toBe(204);
      for (const id of created.reverse()) expect((await page.request.delete(`/api/archive/items/${id}`)).status()).toBe(204);
      await ownProject.cleanup();
    }
  },
});

for (const via of ["keyboard", "overlay"] as const) {
  test(`delete and undo via ${via} preserves the complete item after reload`, async ({ page, fixture: f }) => {
    const items = async () => await (await page.request.get(`/api/items?projectId=${f.projectId}`)).json() as Item[];
    // Rank, not the raw number: an item added to the list meanwhile renumbers positions without reordering.
    const ranked = async () => {
      const all = await items();
      const it = all.find((x) => x.id === f.parent)!;
      const rank = all.filter((x) => x.listId === it.listId && !x.parentItemId && [f.parent, f.other].includes(x.id)).sort((a, b) => a.position - b.position).findIndex((x) => x.id === f.parent);
      return { ...it, position: rank };
    };
    const before = await ranked();
    const details = await (await page.request.get(`/api/items/${f.parent}/details`)).json() as ItemDetails;
    await page.goto(`/p/${f.projectId}?v=list${via === "overlay" ? `&item=${f.parent}` : ""}`);
    if (via === "keyboard") {
      await page.locator(`[data-drag-id="${f.parent}"]`).focus();
      await page.keyboard.press("Backspace");
    } else {
      await page.getByRole("button", { name: "Item options", exact: true }).click();
      await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    }
    await expect(page.getByRole("status").filter({ hasText: /Deleted|Undid:|could not be deleted/ })).toContainText("Deleted");
    await expect.poll(async () => (await items()).some((it) => it.id === f.parent)).toBe(false);
    if (via === "keyboard") await page.keyboard.press("z");
    else await page.getByRole("button", { name: /^Undo/ }).click();
    await expect(page.getByRole("status").filter({ hasText: /Deleted|Undid:|could not be deleted/ })).toContainText("Undid:");
    await page.reload();
    const after = await ranked();
    expect(after.version).toBeGreaterThan(before.version);
    expect({ ...after, updatedAt: before.updatedAt, version: before.version }).toEqual(before);
    expect(await (await page.request.get(`/api/items/${f.parent}/details`)).json()).toEqual(details);
  });
}

test("a failed subitem restore keeps Undo available for retry", async ({ page, fixture: f }) => {
  const before = await (await page.request.get(`/api/items/${f.child}/details`)).json();
  const beforeItems = await (await page.request.get(`/api/items?projectId=${f.projectId}`)).json() as Item[];
  const beforeItem = beforeItems.find((it) => it.id === f.child)!;
  await page.goto(`/p/${f.projectId}?v=list&item=${f.child}`);
  await page.getByRole("button", { name: "Item options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /Deleted|Undid:|could not be deleted/ })).toContainText("Deleted");
  await page.route(`**/api/items/${f.child}`, (route) => route.request().method() === "PATCH" ? route.fulfill({ status: 422, json: { error: "Simulated validation failure" } }) : route.continue());
  await page.getByRole("button", { name: /^Undo/ }).click();
  await expect(page.getByRole("button", { name: /^Retry Undo/ })).toBeVisible();
  await page.unroute(`**/api/items/${f.child}`);
  await page.getByRole("button", { name: /^Retry Undo/ }).click();
  await expect(page.getByRole("status").filter({ hasText: /Deleted|Undid:|could not be deleted/ })).toContainText("Undid:");
  await page.reload();
  const rows = await (await page.request.get(`/api/items?projectId=${f.projectId}`)).json() as Item[];
  const afterItem = rows.find((it) => it.id === f.child)!;
  expect(afterItem.version).toBeGreaterThan(beforeItem.version);
  expect({ ...afterItem, updatedAt: beforeItem.updatedAt, version: beforeItem.version }).toEqual(beforeItem);
  expect(await (await page.request.get(`/api/items/${f.child}/details`)).json()).toEqual(before);
});

test("checklist bulk Undo retries only the restores that failed", async ({ page, fixture: f }) => {
  await page.goto(`/p/${f.projectId}?v=list&item=${f.parent}`);
  await page.getByRole("button", { name: "Delete subitems", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /Deleted|Undid:|could not be deleted/ })).toContainText("Deleted 2 subitems");
  // The toast follows nested modal focus boundaries and returns when the nested dialog closes.
  await page.getByRole("button", { name: "Item options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Make subitem of…", exact: true }).click();
  const nested = page.getByRole("dialog", { name: "Make subitem of", exact: true });
  await expect(nested.getByRole("button", { name: /^Undo/ })).toBeVisible();
  await nested.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: /^Undo/ })).toBeVisible();
  const restored: string[] = [];
  let failSecond = true;
  await page.route("**/api/items/*", async (route) => {
    const request = route.request();
    if (request.method() !== "PATCH" || request.postDataJSON().deleted !== false) return route.continue();
    const id = new URL(request.url()).pathname.split("/").at(-1)!;
    if (id === f.sibling && failSecond) return route.fulfill({ status: 422, json: { error: "Simulated validation failure" } });
    restored.push(id);
    await route.continue();
  });
  await page.getByRole("button", { name: /^Undo/ }).click();
  await expect(page.getByRole("button", { name: /^Retry Undo/ })).toBeVisible();
  failSecond = false;
  await page.getByRole("button", { name: /^Retry Undo/ }).click();
  await expect(page.getByRole("status").filter({ hasText: /Deleted|Undid:|could not be deleted/ })).toContainText("Undid:");
  expect(restored).toEqual([f.child, f.sibling]);
  await page.reload();
  const checklist = page.getByRole("group", { name: "Subitems", exact: true });
  await expect(checklist.getByText(`Undo fixture ${f.child}`, { exact: true })).toBeVisible();
  await expect(checklist.getByText(`Undo fixture ${f.sibling}`, { exact: true })).toBeVisible();
});

test("Undo is registered only after deletion succeeds", async ({ page, fixture: f }) => {
  await page.goto(`/p/${f.projectId}?v=list`);
  let release!: () => void;
  let observed!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { observed = resolve; });
  await page.route(`**/api/items/${f.other}`, async (route) => {
    if (route.request().method() !== "DELETE") return route.continue();
    observed();
    await pending;
    await route.continue();
  });
  try {
    await page.locator(`[data-drag-id="${f.other}"]`).focus();
    await page.keyboard.press("Backspace");
    await started;
    await expect(page.getByRole("status").filter({ hasText: "Deleted" })).toHaveCount(0);
    release();
    await expect(page.getByRole("status").filter({ hasText: "Deleted" })).toBeVisible();
    await page.keyboard.press("ControlOrMeta+k");
    const palette = page.getByRole("dialog", { name: "Jump to item" });
    await palette.getByRole("button", { name: /^Undo/ }).click();
    await expect(palette.getByRole("status")).toContainText("Undid:");
    await page.keyboard.press("Escape");
    await expect(page.locator(`[data-drag-id="${f.other}"]`)).toBeVisible();
  } finally {
    release();
  }
});

test("bulk deletion reports partial failure and only undoes confirmed deletions", async ({ page, fixture: f }) => {
  await page.goto(`/p/${f.projectId}?v=list`);
  await page.route(`**/api/items/${f.other}`, (route) => route.request().method() === "DELETE" ? route.fulfill({ status: 422, json: { error: "Simulated deletion validation failure" } }) : route.continue());
  for (const id of [f.parent, f.other]) {
    await page.locator(`[data-drag-id="${id}"]`).focus();
    await page.keyboard.press("s");
  }
  await page.getByRole("toolbar", { name: /selected item/ }).getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /Deleted|Undid:|could not be deleted/ })).toContainText("1 could not be deleted");
  const restored: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "PATCH" && request.postDataJSON()?.deleted === false) restored.push(new URL(request.url()).pathname.split("/").at(-1)!);
  });
  // Undo is durably queued behind the refused deletion; reviewing that refusal allows it to replay.
  await page.getByRole("button", { name: /^Undo/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Undoing…" })).toBeVisible();
  await page.getByRole("banner").getByRole("button", { name: /couldn't sync/ }).click();
  await page.getByRole("menuitem", { name: "Storage & sync settings" }).click();
  await page.getByRole("button", { name: "Discard change", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Discard change", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Saved change", exact: true })).toHaveCount(0);
  await expect.poll(async () => (await (await page.request.get(`/api/items?projectId=${f.projectId}`)).json() as Item[]).some((item) => item.id === f.parent)).toBe(true);
  await page.goBack();
  expect(restored).toEqual([f.parent]);
  await page.reload();
  await expect(page.locator(`[data-drag-id="${f.parent}"]`)).toBeVisible();
  await expect(page.locator(`[data-drag-id="${f.other}"]`)).toBeVisible();
});

import { expect, test as base, type Page } from "@playwright/test";
import { nanoid } from "nanoid";

import type { GroupWithProjects, Item, Label, ProjectDetail } from "../../src/client/data/api";
import { freshProject, seedProjectId, signIn } from "./helpers";

// Duplication (DESIGN.md › Item overlay, Duplicate): a richly populated item in a fresh project where Sam
// is an editor is duplicated in place and copied to a fresh project in another group, where Sam is not a
// member and one label exists only by name. Included fields survive a reload; what stays behind is said.
type Fixture = { source: { id: string }; listId: string; dest: { id: string; name: string }; rich: string; title: string; labels: Array<{ id: string; name: string }>; sam: string };
const test = base.extend<{ fixture: Fixture }>({
  fixture: async ({ page }, use) => {
    await signIn(page);
    const seed = await (await page.request.get(`/api/projects/${await seedProjectId(page)}`)).json() as ProjectDetail;
    const owner = seed.members.find((m) => m.role === "owner")!.userId;
    const sam = seed.members.find((m) => m.userId !== owner)!.userId;
    const groups = await (await page.request.get("/api/groups")).json() as GroupWithProjects[];
    const otherGroup = groups.find((g) => g.id !== seed.groupId && g.ownerId === owner) ?? groups.find((g) => g.id !== seed.groupId)!;
    const source = await freshProject(page, "Copy source", { lists: [["Copy source", null]] });
    const dest = await freshProject(page, "Copy target", { lists: [["Arrivals", null]], groupId: otherGroup.id });
    try {
      expect((await page.request.put(`/api/projects/${source.projectId}/members/${sam}`, { data: { role: "editor" } })).ok()).toBeTruthy();
      const labels = [{ id: nanoid(), name: "Design" }, { id: nanoid(), name: "Shop" }];
      for (const l of labels) expect((await page.request.post("/api/labels", { data: { ...l, projectId: source.projectId, color: "blue" } })).status()).toBe(201);
      // Same name, different case: the copy reuses it instead of creating a duplicate.
      expect((await page.request.post("/api/labels", { data: { id: nanoid(), projectId: dest.projectId, name: labels[0]!.name.toUpperCase(), color: "teal" } })).status()).toBe(201);
      const title = `Copy fixture ${source.projectId.slice(0, 6)}`;
      const rich = await source.item(title, { description: "**Keep** this", priority: "HIGH", startDate: "2026-10-12", dueDate: "2026-10-14", dueTime: "09:30", labelIds: labels.map((l) => l.id), assigneeIds: [owner, sam] });
      expect((await page.request.patch(`/api/items/${rich}`, { data: { repeatRule: { freq: "weekly" }, cover: { color: "teal" } } })).ok()).toBeTruthy();
      const first = await source.item("First step", { parentItemId: rich });
      await source.item("Second step", { parentItemId: rich });
      expect((await page.request.patch(`/api/items/${first}`, { data: { done: true } })).ok()).toBeTruthy();
      const other = await source.item("Copy neighbour");
      expect((await page.request.post(`/api/items/${rich}/comments`, { data: { id: nanoid(), body: "Stays here" } })).status()).toBe(201);
      expect((await page.request.post(`/api/items/${rich}/relations`, { data: { targetId: other, type: "related" } })).status()).toBe(201);
      expect((await page.request.post(`/api/items/${rich}/attachments`, { multipart: { files: { name: "plan.txt", mimeType: "text/plain", buffer: Buffer.from("plan") } } })).status()).toBe(201);
      await use({ source: { id: source.projectId }, listId: source.lists[0]!.id, dest: { id: dest.projectId, name: dest.name }, rich, title, labels, sam });
    } finally {
      await source.cleanup();
      await dest.cleanup();
    }
  },
});

/** The copies of the fixture item in a project: each with its subitems, compared field by field. */
async function copiesIn(page: Page, f: Fixture, projectId: string) {
  const all = (await (await page.request.get(`/api/items?projectId=${projectId}`)).json()) as Item[];
  const labelNames = new Map(((await (await page.request.get(`/api/labels?projectId=${projectId}`)).json()) as Label[]).map((l) => [l.id, l.name.toLowerCase()]));
  return all
    .filter((it) => it.title === f.title && it.id !== f.rich)
    .map((it) => ({
      fields: [it.description, it.priority, it.startDate, it.dueDate, it.dueTime, it.repeatRule, it.cover, it.done],
      labels: it.labelIds.map((id) => labelNames.get(id)).sort(),
      assignees: it.assigneeIds.length,
      key: it.keyNumber,
      subitems: all.filter((s) => s.parentItemId === it.id).map((s) => `${s.title}:${s.done}`).sort(),
    }));
}
const INCLUDED = ["**Keep** this", "HIGH", "2026-10-12", "2026-10-14", "09:30", { freq: "weekly" }, { color: "teal" }, false];

test("Duplicate in the overlay copies every included field beside the original and says what stays behind", async ({ page, fixture: f }) => {
  await page.goto(`/p/${f.source.id}?v=list&item=${f.rich}`);
  await page.getByRole("button", { name: "Item options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  const toast = page.locator(".td-toast");
  await expect(toast).toContainText(`Duplicated “${f.title}” with 2 subitems — 1 comment, 1 file and 1 link stay with the original`);
  await page.screenshot({ path: ".tmp/test-results/duplicate-toast.png" });
  await page.reload();
  const [copy] = await copiesIn(page, f, f.source.id);
  expect(copy).toMatchObject({ fields: INCLUDED, labels: f.labels.map((l) => l.name.toLowerCase()).sort(), assignees: 2, subitems: ["First step:true", "Second step:false"] });
  // Beside its original (before the neighbour that followed it), and listed there after the reload.
  const order = ((await (await page.request.get(`/api/items?projectId=${f.source.id}`)).json()) as Item[]).filter((it) => it.listId === f.listId && !it.parentItemId).sort((a, b) => a.position - b.position);
  expect(order.map((it) => (it.title === f.title ? (it.id === f.rich ? "original" : "copy") : "neighbour"))).toEqual(["original", "copy", "neighbour"]);
  await expect(page.locator("[data-drag-id]", { hasText: f.title })).toHaveCount(2);
  // Undo removes the copy.
  await page.goto(`/p/${f.source.id}?v=list&item=${f.rich}`);
  await page.getByRole("button", { name: "Item options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(toast).toContainText("Duplicated");
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await copiesIn(page, f, f.source.id)).length).toBe(1);
});

test("Copy to another project maps labels by name, leaves non-members off, and the copy keeps its content", async ({ page, fixture: f }) => {
  await page.goto(`/p/${f.source.id}?v=list`);
  await page.locator(`[data-drag-id="${f.rich}"]`).click({ modifiers: ["ControlOrMeta"] });
  await page.getByRole("button", { name: "Move to", exact: true }).click();
  await page.getByRole("menuitem", { name: "Copy to another project…" }).click();
  const picker = page.getByRole("dialog", { name: "Copy to project" });
  await picker.getByRole("option", { name: new RegExp(f.dest.name) }).click();
  await picker.getByRole("option", { name: "Arrivals" }).click();
  const toast = page.locator(".td-toast");
  await expect(toast).toContainText(`Copied “${f.title}” with 2 subitems to ${f.dest.name} › Arrivals — label “${f.labels[1]!.name}” added, 1 non-member not assigned; 1 comment, 1 file and 1 link stay with the original`);
  await page.screenshot({ path: ".tmp/test-results/duplicate-copy-toast.png" });
  const [copy] = await copiesIn(page, f, f.dest.id);
  expect(copy).toMatchObject({ fields: INCLUDED, labels: f.labels.map((l) => l.name.toLowerCase()).sort(), assignees: 1, subitems: ["First step:true", "Second step:false"] });
  expect(copy!.key).not.toBeNull();
  // The destination shows it without a reload of its own data.
  await page.goto(`/p/${f.dest.id}?v=list`);
  await expect(page.getByText(f.title)).toBeVisible();
  // The original is untouched.
  const [original] = ((await (await page.request.get(`/api/items?projectId=${f.source.id}`)).json()) as Item[]).filter((it) => it.id === f.rich);
  expect(original).toMatchObject({ projectId: f.source.id, assigneeIds: expect.arrayContaining([f.sam]) });
});

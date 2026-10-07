import { expect, test as base, type Page } from "@playwright/test";
import { nanoid } from "nanoid";

import type { GroupWithProjects, ProjectDetail } from "../../src/client/data/api";
import { seedProjectId, signIn } from "./helpers";

// Search and the Ctrl+K palette open results by id: a filtered-out item, a subitem, an Inbox item and an
// item in another project, by keyboard and by pointer.
type Fixture = { tag: string; projectId: string; otherId: string; parent: string; sub: string; inbox: string; elsewhere: string };
const test = base.extend<{ fixture: Fixture }>({
  fixture: async ({ page }, use) => {
    await signIn(page);
    const projectId = await seedProjectId(page);
    const groups = (await (await page.request.get("/api/groups")).json()) as GroupWithProjects[];
    const otherId = groups.flatMap((g) => g.projects).find((p) => p.id !== projectId)!.id;
    const listOf = async (id: string) => ((await (await page.request.get(`/api/projects/${id}`)).json()) as ProjectDetail).lists.find((l) => !l.hidden && l.statusRole !== "DONE")!.id;
    const tag = nanoid(6).replace(/[^a-z0-9]/gi, "x");
    const f = { tag, projectId, otherId, parent: nanoid(), sub: nanoid(), inbox: nanoid(), elsewhere: nanoid() };
    const create = async (data: Record<string, unknown>) => expect((await page.request.post("/api/items", { data })).status()).toBe(201);
    const listId = await listOf(projectId);
    await create({ id: f.parent, title: `Zephyr parent ${tag}`, listId });
    await create({ id: f.sub, title: `Zephyr subitem ${tag}`, listId, parentItemId: f.parent });
    await create({ id: f.inbox, title: `Zephyr inbox ${tag}` });
    await create({ id: f.elsewhere, title: `Zephyr elsewhere ${tag}`, listId: await listOf(otherId) });
    try {
      await use(f);
    } finally {
      for (const id of [f.sub, f.parent, f.inbox, f.elsewhere]) expect([204, 404]).toContain((await page.request.delete(`/api/archive/items/${id}`)).status());
    }
  },
});

const field = (page: Page) => page.getByRole("banner").getByRole("combobox", { name: "Search" });
const results = (page: Page) => page.getByRole("listbox", { name: "Search results" });
const overlayOpen = (page: Page, title: string) => expect(page.getByRole("dialog", { name: title })).toBeVisible();

test("the top-bar search opens hidden, nested, Inbox and other-project items", async ({ page, fixture: f }) => {
  // A priority filter hides every fixture item in the board.
  await page.goto(`/p/${f.projectId}?v=board&f=priority:Urgent`);
  await expect(page.getByText(`Zephyr parent ${f.tag}`)).toHaveCount(0);

  await field(page).fill(`zephyr parent ${f.tag}`);
  await expect(results(page).getByRole("option", { name: new RegExp(`Zephyr parent ${f.tag}`) })).toBeVisible();
  await page.screenshot({ path: `.tmp/shots/search-dropdown.png` });
  await results(page).getByRole("option", { name: new RegExp(`Zephyr parent ${f.tag}`) }).click();
  await overlayOpen(page, `Zephyr parent ${f.tag}`);
  // The view keeps its filter; the overlay opens on top of it.
  await expect(page).toHaveURL(/f=priority%3AUrgent|f=priority:Urgent/);
  await page.keyboard.press("Escape");

  // A subitem, by keyboard: type, ↓ to it, Enter.
  await field(page).click();
  await field(page).fill(`subitem ${f.tag}`);
  const sub = results(page).getByRole("option", { name: new RegExp(`Zephyr subitem ${f.tag}`) });
  await expect(sub).toContainText(`Subitem of Zephyr parent ${f.tag}`);
  await page.keyboard.press("Enter");
  await overlayOpen(page, `Zephyr subitem ${f.tag}`);
  await page.keyboard.press("Escape");

  // Another project: a fresh view of that project.
  await field(page).fill(`elsewhere ${f.tag}`);
  await results(page).getByRole("option", { name: new RegExp(`Zephyr elsewhere ${f.tag}`) }).click();
  await expect(page).toHaveURL(new RegExp(`/p/${f.otherId}\\?item=${f.elsewhere}$`));
  await overlayOpen(page, `Zephyr elsewhere ${f.tag}`);
  await page.keyboard.press("Escape");

  // The Inbox: the item opens there.
  await field(page).fill(`inbox ${f.tag}`);
  await results(page).getByRole("option", { name: new RegExp(`Zephyr inbox ${f.tag}`) }).click();
  await expect(page).toHaveURL(new RegExp(`/inbox\\?item=${f.inbox}$`));
  await overlayOpen(page, `Zephyr inbox ${f.tag}`);
});

test("an unmatched query says what was searched", async ({ page, fixture: f }) => {
  await page.goto(`/p/${f.projectId}`);
  await field(page).fill(`no such thing ${f.tag}`);
  // Nothing to choose from: the field collapses and the status line says what was searched.
  await expect(field(page)).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("banner").getByRole("status")).toContainText(`No projects or items match “no such thing ${f.tag}”`);
});

test("the Ctrl+K palette searches every project and opens by id", async ({ page, fixture: f }) => {
  await page.goto(`/p/${f.projectId}?f=priority:Urgent`);
  await expect(page.getByRole("main")).toBeVisible();
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Jump to item" });
  await expect(palette).toBeVisible();
  await palette.getByRole("combobox").fill(f.tag);
  for (const t of ["parent", "subitem", "inbox", "elsewhere"]) await expect(palette.getByRole("option", { name: new RegExp(`^Zephyr ${t} ${f.tag}`) })).toBeVisible();
  await page.screenshot({ path: `.tmp/shots/search-palette.png` });
  // Keyboard: walk to "elsewhere" and open it.
  const names = await palette.getByRole("option").allTextContents();
  const target = names.findIndex((n) => n.includes(`Zephyr elsewhere ${f.tag}`));
  for (let i = 0; i < target; i++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/p/${f.otherId}\\?item=${f.elsewhere}$`));
  await overlayOpen(page, `Zephyr elsewhere ${f.tag}`);
  await page.keyboard.press("Escape");

  // Pointer: the hidden item back in the first project.
  await page.goto(`/p/${f.projectId}?f=priority:Urgent`);
  await expect(page.getByRole("main")).toBeVisible();
  await page.keyboard.press("Control+k");
  await palette.getByRole("combobox").fill(`parent ${f.tag}`);
  await palette.getByRole("option", { name: new RegExp(`^Zephyr parent ${f.tag}`) }).click();
  await overlayOpen(page, `Zephyr parent ${f.tag}`);
});

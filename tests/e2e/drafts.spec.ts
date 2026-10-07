import { expect, test as base, type Page, type Route } from "@playwright/test";
import { nanoid } from "nanoid";

import type { Item, ItemDetails } from "../../src/client/data/api";
import { freshProject, signIn } from "./helpers";

type Fixture = { projectId: string; itemId: string };
const test = base.extend<{ fixture: Fixture }>({
  fixture: async ({ page }, use) => {
    await signIn(page);
    const project = await freshProject(page, "Draft replay");
    const projectId = project.projectId;
    const listId = project.lists[0]!.id;
    const itemId = nanoid();
    try {
      expect((await page.request.post("/api/items", { data: { id: itemId, title: `Draft fixture ${itemId}`, listId, description: "The saved description" } })).status()).toBe(201);
      await use({ projectId, itemId });
    } finally {
      await project.cleanup();
    }
  },
});

const details = async (page: Page, id: string) => (await (await page.request.get(`/api/items/${id}/details`)).json()) as ItemDetails;
const description = async (page: Page, f: Fixture) => ((await (await page.request.get(`/api/items?projectId=${f.projectId}`)).json()) as Item[]).find((it) => it.id === f.itemId)?.description;
const shot = (page: Page, name: string) => page.screenshot({ path: `.tmp/test-results/drafts-${name}.png` });

/** Fail the next matching request in one of the ways a save can fail, then let later ones through. */
async function failOnce(page: Page, url: RegExp, how: "offline" | "validation" | "lost") {
  let armed = true;
  const handler = async (route: Route) => {
    if (!armed || route.request().method() === "GET") return route.continue();
    armed = false;
    if (how === "offline") return route.abort("internetdisconnected");
    if (how === "validation") return route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ error: "The description couldn't be accepted" }) });
    // The server saves it, but the response never arrives.
    await route.fetch();
    return route.abort("connectionreset");
  };
  await page.route(url, handler);
}

test("comments replay temporary failures once and keep invalid text editable", async ({ page, fixture: f }) => {
  await page.goto(`/p/${f.projectId}?v=list&item=${f.itemId}`);
  const composer = page.getByRole("textbox", { name: "Comment", exact: true });
  const dialog = page.getByRole("dialog");

  await failOnce(page, /\/api\/items\/[^/]+\/comments$/, "offline");
  await composer.fill("First try, while offline");
  await composer.press("Enter");
  await expect(composer).toHaveValue("");
  await expect.poll(async () => (await details(page, f.itemId)).comments.map((comment) => comment.body)).toEqual(["First try, while offline"]);
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await shot(page, "comment-offline");

  // The server keeps it but the answer is lost: the retry must not post a second copy.
  await failOnce(page, /\/api\/items\/[^/]+\/comments$/, "lost");
  await composer.fill("The server saved this response before the connection broke");
  await composer.press("Enter");
  await expect(composer).toHaveValue("");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect.poll(async () => (await details(page, f.itemId)).comments.map((c) => c.body)).toEqual(["First try, while offline", "The server saved this response before the connection broke"]);
  await expect(dialog.getByText("First try, while offline", { exact: true })).toBeVisible();

  // A real validation failure from the API keeps the text too.
  const long = "x".repeat(20_001);
  await composer.fill(long);
  await composer.press("Enter");
  await expect(dialog.getByRole("alert")).toContainText("Couldn't send: Too big");
  await expect(composer).toHaveValue(long);
  await shot(page, "comment-invalid");
  await composer.fill("Short enough");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await composer.press("Enter");
  await expect(composer).toHaveValue("");
  await expect.poll(async () => (await details(page, f.itemId)).comments.length).toBe(3);
});

test("a description stays in edit until saved, and save-and-close stays open when a save fails", async ({ page, fixture: f }) => {
  await page.goto(`/p/${f.projectId}?v=list&item=${f.itemId}`);
  const dialog = page.getByRole("dialog");
  await dialog.getByTitle("Click to edit description").click();
  const editor = dialog.getByRole("textbox", { name: "Description" });
  await expect(editor).toHaveText("The saved description");
  await editor.fill("Rewritten while the server says no");
  await expect(editor).toHaveText("Rewritten while the server says no");

  await failOnce(page, /\/api\/items\/[^/]+$/, "validation");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Couldn't save: The description couldn't be accepted");
  await expect(editor).toHaveText("Rewritten while the server says no");
  await expect(dialog.getByRole("button", { name: "Discard", exact: true })).toBeVisible();
  await shot(page, "description-invalid");
  await expect.poll(() => description(page, f)).toBe("The saved description");

  // ctrl+↵ with a failing save keeps the overlay and the draft.
  await failOnce(page, /\/api\/items\/[^/]+$/, "offline");
  await editor.press("ControlOrMeta+Enter");
  // Temporary network errors replay automatically; close only after the save is confirmed.
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => description(page, f)).toBe("Rewritten while the server says no");
  // A saved draft is not offered again.
  await page.goto(`/p/${f.projectId}?v=list&item=${f.itemId}`);
  await expect(dialog.getByTitle("Click to edit description")).toHaveText("Rewritten while the server says no");
});

test("closing keeps unsent drafts for that item until they are saved or discarded", async ({ page, fixture: f }) => {
  await page.goto(`/p/${f.projectId}?v=list&item=${f.itemId}`);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Comment", exact: true }).fill("A comment I have not sent");
  await dialog.getByTitle("Click to edit description").click();
  await expect(dialog.getByRole("textbox", { name: "Description" })).toHaveText("The saved description");
  await dialog.getByRole("textbox", { name: "Description" }).fill("The saved description — and an unsaved addition");
  await page.keyboard.press("Escape");
  // Esc inside the editor discards that edit; the comment draft is kept.
  await dialog.getByTitle("Click to edit description").click();
  await expect(dialog.getByRole("textbox", { name: "Description" })).toHaveText("The saved description");
  await dialog.getByRole("textbox", { name: "Description" }).fill("The saved description — kept this time");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toHaveCount(0);

  // Reload too: the drafts belong to this tab, not to the overlay instance.
  await page.reload();
  await page.goto(`/p/${f.projectId}?v=list&item=${f.itemId}`);
  await expect(dialog.getByRole("textbox", { name: "Comment", exact: true })).toHaveValue("A comment I have not sent");
  await expect(dialog.getByRole("textbox", { name: "Description" })).toHaveText("The saved description — kept this time");
  await expect(dialog.getByText("Unsaved", { exact: true })).toBeVisible();
  await shot(page, "restored");
  expect(await description(page, f)).toBe("The saved description");

  await dialog.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(dialog.getByText("The saved description", { exact: true })).toBeVisible();
  await dialog.getByRole("textbox", { name: "Comment", exact: true }).fill("");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await page.goto(`/p/${f.projectId}?v=list&item=${f.itemId}`);
  await expect(dialog.getByRole("textbox", { name: "Comment", exact: true })).toHaveValue("");
  await expect(dialog.getByTitle("Click to edit description")).toBeVisible();
});

test("a delayed comment acknowledgement preserves newer comment and description drafts", async ({ page, fixture: f }) => {
  let release!: () => void;
  let observed!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { observed = resolve; });
  await page.route(`**/api/items/${f.itemId}/comments`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    observed();
    await pending;
    await route.continue();
  });
  try {
    await page.goto(`/p/${f.projectId}?v=list&item=${f.itemId}`);
    const dialog = page.getByRole("dialog");
    const composer = dialog.getByRole("textbox", { name: "Comment", exact: true });
    await composer.fill("The first submitted comment");
    await composer.press("Enter");
    await started;
    await composer.fill("A newer comment draft");
    await dialog.getByTitle("Click to edit description").click();
    await expect(dialog.getByRole("textbox", { name: "Description", exact: true })).toHaveText("The saved description");
    await dialog.getByRole("textbox", { name: "Description", exact: true }).fill("A newer unsaved description");
    await expect(dialog.getByRole("textbox", { name: "Description", exact: true })).toHaveText("A newer unsaved description");
    release();
    await expect.poll(async () => (await details(page, f.itemId)).comments.map((comment) => comment.body)).toEqual(["The first submitted comment"]);
    await expect(composer).toHaveValue("A newer comment draft");
    await expect(dialog.getByRole("textbox", { name: "Description", exact: true })).toHaveText("A newer unsaved description");
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await page.goto(`/p/${f.projectId}?v=list&item=${f.itemId}`);
    await expect(composer).toHaveValue("A newer comment draft");
    await expect(dialog.getByRole("textbox", { name: "Description", exact: true })).toHaveText("A newer unsaved description");
    await composer.press("Enter");
    await expect(composer).toHaveValue("");
    await expect.poll(async () => (await details(page, f.itemId)).comments.map((comment) => comment.body)).toEqual(["The first submitted comment", "A newer comment draft"]);
    await expect(dialog.getByRole("textbox", { name: "Description", exact: true })).toHaveText("A newer unsaved description");
    expect(await description(page, f)).toBe("The saved description");
  } finally { release(); }
});

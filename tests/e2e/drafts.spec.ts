import { expect, test as base, type Page, type Route } from "@playwright/test";
import { nanoid } from "nanoid";

import type { Item, ItemDetails, ProjectDetail } from "../../src/client/data/api";
import { seedProjectId, signIn } from "./helpers";

type Fixture = { projectId: string; itemId: string };
const test = base.extend<{ fixture: Fixture }>({
  fixture: async ({ page }, use) => {
    await signIn(page);
    const projectId = await seedProjectId(page);
    const project = await (await page.request.get(`/api/projects/${projectId}`)).json() as ProjectDetail;
    const listId = project.lists.find((l) => !l.hidden && l.statusRole !== "DONE")!.id;
    const itemId = nanoid();
    expect((await page.request.post("/api/items", { data: { id: itemId, title: `Draft fixture ${itemId}`, listId, description: "The saved description" } })).status()).toBe(201);
    try {
      await use({ projectId, itemId });
    } finally {
      expect([204, 404]).toContain((await page.request.delete(`/api/archive/items/${itemId}`)).status());
    }
  },
});

const details = async (page: Page, id: string) => (await (await page.request.get(`/api/items/${id}/details`)).json()) as ItemDetails;
const description = async (page: Page, f: Fixture) => ((await (await page.request.get(`/api/items?projectId=${f.projectId}`)).json()) as Item[]).find((it) => it.id === f.itemId)?.description;
const shot = (page: Page, name: string) => page.screenshot({ path: `.tmp/test-results/drafts-${name}.png` });

/** Fail the next matching request in one of the ways a save can fail, then let later ones through. */
async function failOnce(page: Page, url: RegExp, how: "offline" | "forbidden" | "lost") {
  let armed = true;
  const handler = async (route: Route) => {
    if (!armed || route.request().method() === "GET") return route.continue();
    armed = false;
    if (how === "offline") return route.abort("internetdisconnected");
    if (how === "forbidden") return route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "You don't have access to this content" }) });
    // The server saves it, but the response never arrives.
    await route.fetch();
    return route.abort("connectionreset");
  };
  await page.route(url, handler);
}

test("a comment stays editable through failures and a retry posts it once", async ({ page, fixture: f }) => {
  await page.goto(`/p/${f.projectId}?v=list&item=${f.itemId}`);
  const composer = page.getByRole("textbox", { name: "Comment", exact: true });
  const dialog = page.getByRole("dialog");

  await failOnce(page, /\/api\/items\/[^/]+\/comments$/, "offline");
  await composer.fill("First try, while offline");
  await composer.press("Enter");
  await expect(dialog.getByRole("alert")).toHaveText("Couldn't send: Couldn't reach Todoi. Check your connection.");
  await expect(composer).toHaveValue("First try, while offline");
  await expect(dialog.getByRole("button", { name: "Retry", exact: true })).toBeVisible();
  await shot(page, "comment-offline");

  await failOnce(page, /\/api\/items\/[^/]+\/comments$/, "forbidden");
  await dialog.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Couldn't send: You don't have access to this content");
  await expect(composer).toHaveValue("First try, while offline");

  // The server keeps it but the answer is lost: the retry must not post a second copy.
  await failOnce(page, /\/api\/items\/[^/]+\/comments$/, "lost");
  await dialog.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(composer).toHaveValue("");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect.poll(async () => (await details(page, f.itemId)).comments.map((c) => c.body)).toEqual(["First try, while offline"]);
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
  await expect.poll(async () => (await details(page, f.itemId)).comments.length).toBe(2);
});

test("a description stays in edit until saved, and save-and-close stays open when a save fails", async ({ page, fixture: f }) => {
  await page.goto(`/p/${f.projectId}?v=list&item=${f.itemId}`);
  const dialog = page.getByRole("dialog");
  await dialog.getByTitle("Click to edit description").click();
  const editor = dialog.getByRole("textbox", { name: "Description" });
  await editor.press("ControlOrMeta+a");
  await editor.pressSequentially("Rewritten while the server says no");

  await failOnce(page, /\/api\/items\/[^/]+$/, "forbidden");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("Couldn't save: You don't have access to this content");
  await expect(editor).toHaveText("Rewritten while the server says no");
  await expect(dialog.getByRole("button", { name: "Discard", exact: true })).toBeVisible();
  await shot(page, "description-forbidden");
  await expect.poll(() => description(page, f)).toBe("The saved description");

  // ctrl+↵ with a failing save keeps the overlay and the draft.
  await failOnce(page, /\/api\/items\/[^/]+$/, "offline");
  await editor.press("ControlOrMeta+Enter");
  await expect(dialog.getByRole("alert")).toHaveText("Couldn't save: Couldn't reach Todoi. Check your connection.");
  await expect(dialog).toBeVisible();
  await expect(editor).toHaveText("Rewritten while the server says no");

  // Once it saves, ctrl+↵ closes.
  await editor.press("ControlOrMeta+Enter");
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
  await dialog.getByRole("textbox", { name: "Description" }).press("End");
  await dialog.getByRole("textbox", { name: "Description" }).pressSequentially(" — and an unsaved addition");
  await page.keyboard.press("Escape");
  // Esc inside the editor discards that edit; the comment draft is kept.
  await dialog.getByTitle("Click to edit description").click();
  await dialog.getByRole("textbox", { name: "Description" }).press("End");
  await dialog.getByRole("textbox", { name: "Description" }).pressSequentially(" — kept this time");
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

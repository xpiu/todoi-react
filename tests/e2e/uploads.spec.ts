import { expect, test } from "@playwright/test";
import { nanoid } from "nanoid";

import type { ItemDetails, ProjectDetail } from "../../src/client/data/api";
import { MAX_ATTACHMENT_BYTES } from "../../src/shared/uploads";
import { seedProjectId, signIn } from "./helpers";

// Each file is its own upload: an oversized file fails before sending, a failed request keeps its row
// with Retry, and Retry sends only that file — once.
test("uploads report per-file outcomes and retry only the failed file", async ({ page }) => {
  await signIn(page);
  const projectId = await seedProjectId(page);
  const project = (await (await page.request.get(`/api/projects/${projectId}`)).json()) as ProjectDetail;
  const listId = project.lists.find((l) => !l.hidden && l.statusRole !== "DONE")!.id;
  const itemId = nanoid();
  expect((await page.request.post("/api/items", { data: { id: itemId, title: `Upload fixture ${itemId}`, listId } })).status()).toBe(201);
  const names = async () => ((await (await page.request.get(`/api/items/${itemId}/details`)).json()) as ItemDetails).attachments.map((a) => a.name).sort();
  try {
    await page.goto(`/p/${projectId}?item=${itemId}`);
    const dialog = page.getByRole("dialog");
    const row = (name: string) => dialog.locator(".td-att-row", { hasText: name });
    let posts = 0;
    await page.route("**/api/items/*/attachments", (route) => (route.request().method() === "POST" && ++posts === 2 ? route.abort("connectionreset") : route.continue()));
    await dialog.locator(".td-att-input").setInputFiles([
      { name: "kept.txt", mimeType: "text/plain", buffer: Buffer.from("kept") },
      { name: "flaky.txt", mimeType: "text/plain", buffer: Buffer.from("flaky") },
      { name: "huge.bin", mimeType: "application/octet-stream", buffer: Buffer.alloc(MAX_ATTACHMENT_BYTES + 1) },
    ]);
    await expect(row("huge.bin")).toContainText("huge.bin is larger than 25 MB");
    await expect(row("huge.bin").getByRole("button", { name: "Retry" })).toHaveCount(0);
    await expect(row("flaky.txt")).toContainText("Couldn't reach Todoi");
    await expect(row("kept.txt")).toContainText("Added");
    expect(await names()).toEqual(["kept.txt"]);
    await expect(page.getByRole("status")).toContainText("Couldn't attach 2 files");

    await row("flaky.txt").getByRole("button", { name: "Retry" }).click();
    await expect(row("flaky.txt")).toContainText("Added");
    expect(posts).toBe(3);
    expect(await names()).toEqual(["flaky.txt", "kept.txt"]);
    await row("huge.bin").getByRole("button", { name: "Remove huge.bin" }).click();
    await expect(row("huge.bin")).toHaveCount(0);
  } finally {
    expect([204, 404]).toContain((await page.request.delete(`/api/archive/items/${itemId}`)).status());
  }
});

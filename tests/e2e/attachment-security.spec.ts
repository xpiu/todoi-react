import { expect, test } from "@playwright/test";

import { firstItemId, seedProjectId, signIn } from "./helpers";

test("untrusted attachments download while ordinary images still preview", async ({ page }) => {
  await signIn(page);
  const itemId = await firstItemId(page, await seedProjectId(page));
  const created: string[] = [];
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
  const upload = async (name: string, mimeType: string, buffer: Buffer) => {
    const result = await page.request.post(`/api/items/${itemId}/attachments`, { multipart: { files: { name, mimeType, buffer } } });
    expect(result.status()).toBe(201);
    const [file] = await result.json() as Array<{ id: string }>;
    created.push(file!.id);
    return `/api/attachments/${file!.id}/file`;
  };
  try {
    await page.goto("/");
    await page.evaluate(() => { localStorage.removeItem("attachment-executed"); });
    const script = "localStorage.setItem('attachment-executed','yes')";
    for (const [name, mime, source] of [
      ["active.html", "text/html", `<script>${script}</script>`],
      ["active.svg", "image/svg+xml", `<svg xmlns="http://www.w3.org/2000/svg" onload="${script}"/>`],
      ["fake.png", "image/png", `<script>${script}</script>`],
    ] as const) {
      const url = await upload(name, mime, Buffer.from(source));
      const downloaded = page.waitForEvent("download");
      await page.evaluate((href) => { const a = document.createElement("a"); a.href = href; document.body.append(a); a.click(); a.remove(); }, url);
      const download = await downloaded;
      expect(download.suggestedFilename()).toBe(name);
      expect(await download.failure()).toBeNull();
      expect(await page.evaluate(() => localStorage.getItem("attachment-executed"))).toBeNull();
    }
    // The upload's misleading MIME must not override the actual raster type.
    const preview = await upload("image.png", "text/html", png);
    await page.goto(preview);
    const image = page.locator("img");
    await expect(image).toBeVisible();
    expect(await image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(1);
    await page.goto("/");
    const downloaded = page.waitForEvent("download");
    await page.evaluate((href) => { const a = document.createElement("a"); a.href = href; document.body.append(a); a.click(); }, `${preview}?download`);
    expect((await downloaded).suggestedFilename()).toBe("image.png");
  } finally {
    for (const id of created) expect((await page.request.delete(`/api/attachments/${id}`)).status()).toBe(204);
  }
});

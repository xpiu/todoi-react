import { expect, test } from "@playwright/test";
import { nanoid } from "nanoid";

import { checkA11y, freshProject, SCOPES, trackAccounts, useScope } from "./helpers";

trackAccounts(test);
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");

for (const scope of SCOPES) test(`avatar upload, propagation, replacement and removal in ${scope}`, async ({ page }) => {
  await useScope(page, scope);
  const signed = await page.request.post("/api/auth/sign-up/email", { data: { name: "Avatar test", email: `avatar-${nanoid()}@example.test`, password: "avatar-test-password" } });
  expect(signed.ok()).toBeTruthy();
  const { user } = await signed.json();
  const groupId = nanoid();
  expect((await page.request.post("/api/groups", { data: { id: groupId, name: "Avatar project", keyPrefix: "AV" } })).status()).toBe(201);
  const f = await freshProject(page, "Avatar", { groupId });
  const item = await f.item("Show my image");
  expect((await page.request.put(`/api/items/${item}/assignees`, { data: { userIds: [user.id] } })).status()).toBe(200);
  expect((await page.request.post(`/api/items/${item}/comments`, { data: { id: nanoid(), body: "Image on comments" } })).status()).toBe(201);
  if (scope === "minimal-light") await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/account?s=profile");
  const file = page.getByLabel("Avatar image file");
  await file.setInputFiles({ name: "profile.png", mimeType: "image/png", buffer: png });
  await expect(page.getByRole("button", { name: "Change image", exact: true })).toBeEnabled();
  const image = (await (await page.request.get("/api/me")).json()).image as string;
  await expect(page.locator('.td-set-id img')).toHaveAttribute("src", image);
  await expect(page.locator('.td-topnav-avatarbtn img')).toHaveAttribute("src", image);
  await expect.poll(() => page.locator('.td-set-id img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
  const served = await page.request.get(image);
  expect(served.headers()["content-type"]).toBe("image/png");
  expect(served.headers()["x-content-type-options"]).toBe("nosniff");
  expect(await served.body()).toEqual(png);
  await checkA11y(page, `${scope} avatar profile`);
  await page.screenshot({ path: `.tmp/avatar/${scope}-profile.png` });
  await page.reload();
  await expect(page.locator('.td-set-id img')).toHaveAttribute("src", image);
  // The same URL reaches members, row assignees and comments rather than only the settings preview.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/p/${f.projectId}?v=list`);
  await expect(page.locator(`[data-drag-id="${item}"] img`)).toHaveAttribute("src", image);
  await page.locator('button[data-menu="members"]').click();
  await expect(page.getByRole("list", { name: "Members" }).locator("img")).toHaveAttribute("src", image);
  await page.keyboard.press("Escape");
  await page.goto(`/p/${f.projectId}?item=${item}`);
  await expect(page.locator('.td-comment img').first()).toHaveAttribute("src", image);
  await page.goto("/account?s=profile");
  await file.setInputFiles({ name: "replacement.png", mimeType: "image/png", buffer: png });
  await expect.poll(async () => (await (await page.request.get("/api/me")).json()).image).not.toBe(image);
  await expect(page.getByRole("button", { name: "Change image", exact: true })).toBeEnabled();
  expect((await page.request.get(image)).status()).toBe(404);
  await page.getByRole("button", { name: "Remove image", exact: true }).click();
  await expect(page.getByRole("button", { name: "Upload image", exact: true })).toBeEnabled();
  await expect(page.locator('.td-set-id img')).toHaveCount(0);
  await expect(page.locator('.td-topnav-avatarbtn img')).toHaveCount(0);
  expect((await (await page.request.get("/api/me")).json()).image).toBeNull();
});

test("invalid, oversized and failed image uploads preserve the current avatar", async ({ page }) => {
  expect((await page.request.post("/api/auth/sign-up/email", { data: { name: "Avatar recovery", email: `avatar-${nanoid()}@example.test`, password: "avatar-test-password" } })).ok()).toBeTruthy();
  await page.goto("/account?s=profile");
  const file = page.getByLabel("Avatar image file");
  await file.setInputFiles({ name: "fake.png", mimeType: "image/png", buffer: Buffer.from("<svg><script>alert(1)</script></svg>") });
  await expect(page.getByText(/Choose a PNG, JPEG, GIF or WebP image/)).toBeVisible();
  await file.setInputFiles({ name: "large.png", mimeType: "image/png", buffer: Buffer.alloc(2 * 1024 * 1024 + 1) });
  await expect(page.getByText("Choose an image up to 2 MB.")).toBeVisible();
  expect((await page.request.post("/api/me/avatar", { multipart: { file: { name: "large.png", mimeType: "image/png", buffer: Buffer.alloc(2 * 1024 * 1024 + 1) } } })).status()).toBe(413);
  await page.route("**/api/me/avatar", (route) => route.fulfill({ status: 500, json: { error: "Storage unavailable" } }));
  await file.setInputFiles({ name: "retry.png", mimeType: "image/png", buffer: png });
  await expect(page.getByText(/Couldn't save your image.*Storage unavailable/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload image", exact: true })).toBeEnabled();
  await page.unroute("**/api/me/avatar");
  await file.setInputFiles({ name: "retry.png", mimeType: "image/png", buffer: png });
  await expect(page.getByRole("button", { name: "Change image", exact: true })).toBeEnabled();
});

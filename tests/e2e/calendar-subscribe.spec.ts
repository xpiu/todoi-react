import { expect, request, test } from "@playwright/test";
import { nanoid } from "nanoid";

import { freshProject, trackAccounts } from "./helpers";

// "Subscribe to calendar" (DESIGN.md › Views › Calendar): the Calendar header's rss button opens the person's
// private feed link; the link serves their calendar to anyone who has it, without a session; Reset link makes
// a new one and the old one stops at once. "Download a copy" is the account's one-time .ics.
trackAccounts(test);

test("the subscribe dialog shows a private feed link that calendar apps can read, and Reset link replaces it", async ({ page, baseURL }) => {
  expect((await page.request.post("/api/auth/sign-up/email", { data: { name: "Calendar feed", email: `feed-${nanoid()}@example.test`, password: "calendar-test-password" } })).ok()).toBeTruthy();
  const groupId = nanoid();
  expect((await page.request.post("/api/groups", { data: { id: groupId, name: "Feed", keyPrefix: "FD" } })).status()).toBe(201);
  const f = await freshProject(page, "Feed", { groupId });
  await f.item("Feed dated item", { dueDate: "2026-12-09" });
  await f.item("Feed undated item");

  await page.goto(`/p/${f.projectId}?v=calendar`);
  const subscribe = page.getByRole("button", { name: "Subscribe to calendar" });
  await subscribe.click();
  const dialog = page.getByRole("dialog", { name: "Subscribe to calendar" });
  await expect(dialog.getByRole("button", { name: "Done" })).toBeFocused();
  const field = dialog.getByRole("textbox", { name: "Private link" });
  await expect(field).toHaveValue(/\/api\/feeds\/calendar\/[A-Za-z0-9_-]{43}\.ics$/);
  const first = await field.inputValue();

  // A calendar app has no session: a fresh request context, no cookies.
  const app = await request.newContext({ baseURL });
  const feed = await app.get(new URL(first).pathname);
  expect(feed.status()).toBe(200);
  expect(feed.headers()["content-type"]).toBe("text/calendar; charset=utf-8");
  const ics = (await feed.text()).replace(/\r\n /g, "");
  expect(ics).toMatch(/^BEGIN:VCALENDAR/);
  expect(ics).toContain("SUMMARY:Feed dated item");
  expect(ics).not.toContain("Feed undated item");

  // Copy says "Copied" only after the write.
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await dialog.getByRole("button", { name: "Copy" }).click();
  await expect(dialog.getByRole("button", { name: "Copied" })).toBeVisible();

  // Reset link: two steps on its row, then the new link, and the old one stops at once.
  await dialog.getByRole("button", { name: "Reset link" }).click();
  await expect(dialog.getByText("Reset the link?")).toBeVisible();
  await dialog.getByRole("button", { name: "Reset link" }).click();
  await expect(dialog.getByRole("status")).toContainText("New link created. Subscribe again in your calendar app.");
  await expect(field).not.toHaveValue(first);
  const second = await field.inputValue();
  expect((await app.get(new URL(first).pathname)).status()).toBe(404);
  expect((await app.get(new URL(second).pathname)).status()).toBe(200);

  // Download a copy: the account's one-time .ics.
  const downloaded = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Download .ics" }).click();
  expect((await downloaded).suggestedFilename()).toMatch(/^todoi-calendar-.*\.ics$/);

  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(subscribe).toBeFocused();
  // The same link on the next open.
  await subscribe.click();
  await expect(field).toHaveValue(second);
  await app.dispose();
  await f.cleanup();
});

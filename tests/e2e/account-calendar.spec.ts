import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { nanoid } from "nanoid";

import { freshProject, trackAccounts } from "./helpers";

trackAccounts(test);

test("account calendar download includes live dated project and Inbox items", async ({ page }) => {
  expect((await page.request.post("/api/auth/sign-up/email", { data: { name: "Calendar export", email: `calendar-${nanoid()}@example.test`, password: "calendar-test-password" } })).ok()).toBeTruthy();
  const groupId = nanoid();
  expect((await page.request.post("/api/groups", { data: { id: groupId, name: "Calendar", keyPrefix: "CA" } })).status()).toBe(201);
  const f = await freshProject(page, "Calendar export", { groupId });
  const dated = await f.item("Dated project item", { dueDate: "2026-10-12", startDate: "2026-10-10" });
  await f.item("Undated project item");
  await f.item("Start date only", { startDate: "2026-10-17" });
  const removed = await f.item("Deleted dated item", { dueDate: "2026-10-13" });
  expect((await page.request.delete(`/api/items/${removed}`)).status()).toBe(204);
  const archived = await f.item("Archived dated item", { dueDate: "2026-10-14" });
  expect((await page.request.patch(`/api/items/${archived}`, { data: { archived: true } })).status()).toBe(200);
  const hiddenProject = await freshProject(page, "Archived project", { groupId });
  await hiddenProject.item("Dated item in archived project", { dueDate: "2026-10-15" });
  expect((await page.request.post(`/api/projects/${hiddenProject.projectId}/archive`)).status()).toBe(200);
  expect((await page.request.post("/api/items", { data: { id: nanoid(), title: "Dated Inbox item", dueDate: "2026-10-16", dueTime: "09:30" } })).status()).toBe(201);
  await page.goto("/account?s=data");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export .ics", exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/^todoi-calendar-.*\.ics$/);
  const data = (await readFile((await download.path())!, "utf8")).replace(/\r\n /g, "");
  expect(data.match(/BEGIN:VEVENT/g)).toHaveLength(3);
  expect(data).toContain("SUMMARY:Dated project item");
  expect(data).toContain("SUMMARY:Dated Inbox item");
  expect(data).toContain("SUMMARY:Start date only");
  expect(data).toContain("DTSTART;VALUE=DATE:20261017\r\nDTEND;VALUE=DATE:20261018");
  expect(data).toContain("DTSTART;VALUE=DATE:20261010\r\nDTEND;VALUE=DATE:20261013");
  expect(data).toContain("DTSTART:20261016T093000");
  expect(data).toContain(`?item=${dated}`);
  await page.screenshot({ path: ".tmp/calendar/account-data.png" });
});

test("failed calendar downloads report failure and allow retry", async ({ page }) => {
  expect((await page.request.post("/api/auth/sign-up/email", { data: { name: "Calendar retry", email: `calendar-${nanoid()}@example.test`, password: "calendar-test-password" } })).ok()).toBeTruthy();
  await page.goto("/account?s=data");
  await page.route("**/api/me/export/calendar", (route) => route.fulfill({ status: 500, json: { error: "Export unavailable" } }));
  const button = page.getByRole("button", { name: "Export .ics", exact: true });
  await button.click();
  await expect(page.getByText("Couldn't export: Export unavailable")).toBeVisible();
  await expect(button).toBeEnabled();
  await page.unroute("**/api/me/export/calendar");
  const downloaded = page.waitForEvent("download");
  await button.click();
  expect((await downloaded).suggestedFilename()).toMatch(/\.ics$/);
});

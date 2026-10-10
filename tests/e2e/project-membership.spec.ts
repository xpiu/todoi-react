import { expect, test, type Page } from "@playwright/test";
import { nanoid } from "nanoid";

import type { ProjectDetail } from "../../src/client/data/api";
import { checkA11y, freshProject, SCOPES, signIn, trackAccounts, useScope } from "./helpers";

const accounts = trackAccounts(test);
async function openMembers(page: Page, id: string) {
  await page.goto(`/p/${id}`);
  await page.locator('button[data-menu="members"]').click();
  await page.getByRole("button", { name: "Invite people…", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Invite by email" })).toBeVisible();
}

for (const scope of SCOPES) test(`pending invites and ownership handover in ${scope}`, async ({ page, browser }) => {
  await useScope(page, scope);
  await signIn(page);
  const f = await freshProject(page, "Membership");
  const other = await browser.newContext();
  accounts.watch(other);
  const member = await other.newPage();
  const email = `member-${nanoid()}@example.test`;
  const signedUp = await member.request.post("/api/auth/sign-up/email", { data: { name: "New project owner", email, password: "membership-test-password" } });
  expect(signedUp.ok()).toBeTruthy();
  const { user } = await signedUp.json();
  accounts.own(user.id);
  let handedOver = false;
  const detail = async () => await (await page.request.get(`/api/projects/${f.projectId}`)).json() as ProjectDetail;
  try {
    const owner = (await detail()).members.find((m) => m.role === "owner")!;
    expect((await page.request.put(`/api/projects/${f.projectId}/members/${user.id}`, { data: { role: "owner" } })).status()).toBe(400);
    expect((await page.request.delete(`/api/projects/${f.projectId}/members/${owner.userId}`)).status()).toBe(409);
    expect((await page.request.put(`/api/projects/${f.projectId}/members/${owner.userId}`, { data: { role: "editor" } })).status()).toBe(409);
    expect((await page.request.post(`/api/projects/${f.projectId}/ownership`, { data: { userId: user.id } })).status()).toBe(400);
    expect((await page.request.put(`/api/projects/${f.projectId}/members/${user.id}`, { data: { role: "viewer" } })).status()).toBe(200);
    expect((await member.request.post(`/api/projects/${f.projectId}/ownership`, { data: { userId: owner.userId } })).status()).toBe(403);
    expect((await page.request.post(`/api/projects/${f.projectId}/invites`, { data: { email, role: "owner" } })).status()).toBe(400);
    await openMembers(page, f.projectId);
    const pending = page.getByRole("region", { name: "Pending invites" });
    await expect(pending.getByText("No pending invites.")).toBeVisible();
    await page.getByLabel("Invite by email").fill(`pending-${nanoid()}@example.test`);
    await page.getByRole("button", { name: "Invite", exact: true }).click();
    await expect(pending.getByRole("button", { name: "Copy link" })).toBeVisible();
    await pending.getByRole("button", { name: "Copy link" }).click();
    await expect(pending.getByRole("button", { name: "Copied" })).toBeVisible();
    await checkA11y(page, `${scope} pending invites`);
    await page.screenshot({ path: `.tmp/membership/${scope}-invites.png` });
    await pending.getByRole("button", { name: "Revoke", exact: true }).click();
    await expect(pending.getByText("No pending invites.")).toBeVisible();
    await page.getByRole("combobox", { name: "New owner" }).click();
    await page.getByRole("option", { name: "New project owner" }).click();
    await page.getByRole("button", { name: "Transfer…", exact: true }).click();
    await expect(page.getByText(/will become the owner/)).toBeVisible();
    if (scope === "minimal-light") await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Transfer ownership", exact: true }).scrollIntoViewIfNeeded();
    await checkA11y(page, `${scope} handover`);
    await page.screenshot({ path: `.tmp/membership/${scope}-handover.png` });
    const transferResponse = page.waitForResponse((r) => r.url().endsWith("/ownership") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Transfer ownership", exact: true }).click();
    expect((await transferResponse).status()).toBe(204);
    handedOver = true;
    await expect.poll(async () => (await detail()).members.filter((m) => m.role === "owner").map((m) => m.userId)).toEqual([user.id]);
    await expect.poll(async () => (await detail()).members.find((m) => m.userId === owner.userId)?.role).toBe("admin");
    // The previous owner remains an admin; they can still manage invites before leaving.
    expect((await page.request.post(`/api/projects/${f.projectId}/invites`, { data: { email, role: "editor" } })).status()).toBe(201);
    const leave = page.getByRole("button", { name: "Leave", exact: true });
    await expect(leave).toBeEnabled();
    await leave.click();
    const leaving = page.waitForResponse((r) => r.request().method() === "DELETE" && r.url().includes("/members/"));
    await leave.click();
    expect((await leaving).status()).toBe(204);
    await expect(page).toHaveURL(/\/projects$/);
    expect((await page.request.get(`/api/projects/${f.projectId}`)).status()).toBe(403);
    // A viewer can also leave through the same control, without permission to remove anyone else.
    expect((await member.request.put(`/api/projects/${f.projectId}/members/${owner.userId}`, { data: { role: "viewer" } })).status()).toBe(200);
    await page.goto(`/p/${f.projectId}`);
    if (scope === "minimal-light") await page.getByRole("button", { name: "Show sidebar", exact: true }).click();
    await page.getByRole("button", { name: `Settings for ${f.name}`, exact: true }).click();
    await page.getByRole("menuitem", { name: "Project settings", exact: true }).click();
    await expect(page.getByLabel("Project name")).toBeVisible();
    expect((await page.request.delete(`/api/projects/${f.projectId}/members/${user.id}`)).status()).toBe(403);
    await leave.click();
    await leave.click();
    await expect(page).toHaveURL(/\/projects$/);
  } finally {
    const cleanup = handedOver ? member.request : page.request;
    expect((await cleanup.delete(`/api/archive/projects/${f.projectId}`)).status()).toBe(204);
    await other.close();
  }
});

test("invite loading and revoke failures stay local and retryable", async ({ page }) => {
  await signIn(page);
  const f = await freshProject(page, "Invite recovery");
  try {
    const response = await page.request.post(`/api/projects/${f.projectId}/invites`, { data: { email: "retry@example.test", role: "editor" } });
    const invite = await response.json();
    const path = `**/api/projects/${f.projectId}/invites`;
    await page.route(path, (route) => route.fulfill({ status: 403, json: { error: "Invites unavailable" } }));
    await openMembers(page, f.projectId);
    const pending = page.getByRole("region", { name: "Pending invites" });
    await expect(pending.getByText(/Couldn't load invites/)).toBeVisible();
    await page.unroute(path);
    await pending.getByRole("button", { name: "Retry" }).click();
    await expect(pending.getByText("retry@example.test")).toBeVisible();
    await page.route(`**/api/invites/${invite.code}`, (route) => route.fulfill({ status: 403, json: { error: "Permission changed" } }));
    await pending.getByRole("button", { name: "Revoke", exact: true }).click();
    await expect(pending.getByText(/Couldn't revoke.*Permission changed/)).toBeVisible();
    await expect(pending.getByRole("button", { name: "Revoke", exact: true })).toBeEnabled();
    await page.unroute(`**/api/invites/${invite.code}`);
    await pending.getByRole("button", { name: "Revoke", exact: true }).click();
    await expect(pending.getByText("No pending invites.")).toBeVisible();
  } finally { await f.cleanup(); }
});

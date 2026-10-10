import { expect, test, type Page } from "@playwright/test";
import { nanoid } from "nanoid";
import { Pool } from "pg";

import { checkA11y, freshProject, SCOPES, trackAccounts, useScope } from "./helpers";

const accounts = trackAccounts(test);
async function signup(page: Page, name: string) {
  const response = await page.request.post("/api/auth/sign-up/email", { data: { name, email: `invite-${nanoid()}@example.test`, password: "invite-test-password" } });
  expect(response.ok()).toBeTruthy();
  const { user } = await response.json();
  accounts.own(user.id);
  return user as { id: string; email: string };
}

for (const scope of SCOPES) test(`expired invite requests reach the admin Inbox once in ${scope}`, async ({ page, browser }) => {
  await useScope(page, scope);
  const requester = await signup(page, "Invite requester");
  const admin = await browser.newContext();
  accounts.watch(admin);
  const owner = await admin.newPage();
  await signup(owner, "Project admin");
  const groupId = nanoid();
  expect((await owner.request.post("/api/groups", { data: { id: groupId, name: "Invite requests", keyPrefix: "IR" } })).status()).toBe(201);
  const f = await freshProject(owner, "Request a new invite", { groupId });
  const invite = await (await owner.request.post(`/api/projects/${f.projectId}/invites`, { data: { email: requester.email, role: "editor" } })).json();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query("update invites set expires_at = now() - interval '1 day' where id=$1", [invite.id]);
  await pool.end();
  try {
    if (scope === "minimal-light") await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/i/${invite.code}`);
    await expect(page.getByRole("heading", { name: "This invite has expired" })).toBeVisible();
    const request = page.getByRole("button", { name: "Ask for a new invite", exact: true });
    // A failure leaves the action available and explains the real refusal.
    await page.route(`**/api/invites/${invite.code}/request`, (route) => route.fulfill({ status: 500, json: { error: "Request unavailable" } }));
    await request.click();
    await expect(page.getByText(/Couldn't request an invite.*Request unavailable/)).toBeVisible();
    await expect(request).toBeEnabled();
    await page.unroute(`**/api/invites/${invite.code}/request`);
    await request.click();
    await expect(page.getByRole("button", { name: "Invite requested", exact: true })).toBeDisabled();
    await checkA11y(page, `${scope} expired request`);
    await page.screenshot({ path: `.tmp/invite/${scope}-requested.png` });
    await page.reload();
    await expect(page.getByRole("button", { name: "Invite requested", exact: true })).toBeDisabled();
    expect((await page.request.post(`/api/invites/${invite.code}/request`)).status()).toBe(200);
    expect((await page.request.get(`/api/projects/${f.projectId}`)).status()).toBe(403);
    const inbox = await (await owner.request.get("/api/items")).json();
    const requests = inbox.filter((i: { title: string }) => i.title.includes(f.name));
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ unread: true, notification: { kind: "invite", fromUserId: requester.id } });
    expect(requests[0].description).toContain(requester.email);
    await owner.goto("/inbox");
    await expect(owner.getByText(`Invite requester requested a new invite to ${f.name}`, { exact: true })).toBeVisible();
    // Other accounts and signed-out visitors cannot impersonate the invited person.
    expect((await owner.request.post(`/api/invites/${invite.code}/request`)).status()).toBe(403);
    const anonymous = await browser.newContext();
    accounts.watch(anonymous);
    const signedOut = await anonymous.newPage();
    await signedOut.goto(`/i/${invite.code}`);
    await signedOut.getByRole("button", { name: "Ask for a new invite", exact: true }).click();
    await expect(signedOut).toHaveURL(/\/login\?next=/);
    expect((await signedOut.request.post(`/api/invites/${invite.code}/request`)).status()).toBe(401);
    await anonymous.close();
    expect((await owner.request.delete(`/api/invites/${invite.code}`)).status()).toBe(204);
    expect((await page.request.post(`/api/invites/${invite.code}/request`)).status()).toBe(410);
  } finally { await admin.close(); }
});

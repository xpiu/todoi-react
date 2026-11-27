import { expect, test as base } from "@playwright/test";

import { checkA11y, freshProject, SCOPES, signIn, trackAccounts, useScope, type FreshProject } from "./helpers";

const test = base.extend<{ project: FreshProject }>({
  project: async ({ page }, use) => {
    await signIn(page);
    const project = await freshProject(page, "Title rename");
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try { await use(project); } finally {
      await project.cleanup();
      expect(errors, "unexpected browser exceptions").toEqual([]);
    }
  },
});
const accounts = trackAccounts(test);
test.use({ hasTouch: true });

for (const scope of SCOPES) test(`inline rename saves and remains usable in ${scope}`, async ({ page, project }) => {
  await useScope(page, scope);
  await page.goto(`/p/${project.projectId}`);
  const trigger = page.getByRole("button", { name: `Rename project: ${project.name}` });
  await trigger.click();
  const field = page.getByRole("textbox", { name: "Project name", exact: true });
  await expect(field).toBeFocused();
  expect(await field.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])).toEqual([0, project.name.length]);
  await field.pressSequentially("  Kế hoạch 日本語 🚀  ");
  await field.press("Enter");
  const renamed = page.getByRole("button", { name: "Rename project: Kế hoạch 日本語 🚀" });
  await expect(renamed).toBeVisible();
  await expect.poll(async () => (await (await page.request.get(`/api/projects/${project.projectId}`)).json()).name).toBe("Kế hoạch 日本語 🚀");
  await page.reload();
  await expect(renamed).toBeVisible();
  await expect(page.locator(".td-sidebar")).toContainText("Kế hoạch 日本語 🚀");
  await renamed.focus();
  await page.keyboard.press("Space");
  await expect(field).toBeFocused();
  await field.fill("Discard this draft");
  await field.press("Escape");
  await expect(renamed).toBeFocused();
  await checkA11y(page, `${scope} project title`);
});

test("a rejected rename restores the real title and can be retried", async ({ page, project }) => {
  await page.goto(`/p/${project.projectId}`);
  const path = `**/api/projects/${project.projectId}`;
  await page.route(path, (route) => route.request().method() === "PATCH"
    ? route.fulfill({ status: 403, json: { error: "Rename denied" } }) : route.continue());
  await page.getByRole("button", { name: `Rename project: ${project.name}` }).click();
  await page.getByRole("textbox", { name: "Project name", exact: true }).fill("Rejected name");
  const refused = page.waitForResponse((r) => r.request().method() === "PATCH" && r.status() === 403);
  await page.keyboard.press("Enter");
  await refused;
  await expect(page.getByRole("button", { name: `Rename project: ${project.name}` })).toBeVisible();
  await page.unroute(path);
  await page.getByRole("button", { name: `Rename project: ${project.name}` }).click();
  await page.getByRole("textbox", { name: "Project name", exact: true }).fill("Retry succeeded");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Rename project: Retry succeeded" })).toBeVisible();
});

test("IME confirmation keeps the title editor open", async ({ page, project }) => {
  await page.goto(`/p/${project.projectId}`);
  await page.getByRole("button", { name: `Rename project: ${project.name}` }).click();
  const field = page.getByRole("textbox", { name: "Project name", exact: true });
  await field.fill("日本語");
  await field.dispatchEvent("keydown", { key: "Enter", isComposing: true });
  await expect(field).toBeFocused();
  await field.press("Escape");
});

test("same-name project navigation discards the outgoing title draft", async ({ page, project }) => {
  const other = await freshProject(page, "Other title", { groupId: project.groupId });
  try {
    expect((await page.request.patch(`/api/projects/${other.projectId}`, { data: { name: project.name } })).ok()).toBeTruthy();
    await page.goto(`/p/${project.projectId}`);
    await page.locator('.td-sidebar-row:not([aria-current="true"])').filter({ hasText: project.name }).click();
    await expect(page).toHaveURL(new RegExp(`/${other.slug}$`));
    await page.getByRole("button", { name: `Rename project: ${project.name}` }).click();
    await page.getByRole("textbox", { name: "Project name", exact: true }).fill("Outgoing draft");
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/${project.slug}$`));
    await expect(page.getByRole("button", { name: `Rename project: ${project.name}` })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Project name", exact: true })).toHaveCount(0);
    for (const id of [project.projectId, other.projectId]) {
      expect((await (await page.request.get(`/api/projects/${id}`)).json()).name).toBe(project.name);
    }
  } finally { await other.cleanup(); }
});

test("rename follows owner/admin permissions, including public visitors", async ({ page, browser, project }) => {
  const context = await browser.newContext();
  accounts.watch(context);
  const member = await context.newPage();
  try {
    const signup = await member.request.post("/api/auth/sign-up/email", { data: { name: "Title tester", email: `title-${project.projectId}@example.test`, password: "title-test-password" } });
    expect(signup.ok()).toBeTruthy();
    const { user } = await signup.json();
    accounts.own(user.id);
    for (const role of ["editor", "viewer", "admin"] as const) {
      expect((await page.request.put(`/api/projects/${project.projectId}/members/${user.id}`, { data: { role } })).ok()).toBeTruthy();
      await member.goto(`/p/${project.projectId}`);
      await expect(member.locator(".td-topnav-title")).toHaveText(project.name);
      await expect(member.getByRole("button", { name: `Rename project: ${project.name}` })).toHaveCount(role === "admin" ? 1 : 0);
      if (role !== "admin") expect((await member.request.patch(`/api/projects/${project.projectId}`, { data: { name: "Forbidden" } })).status()).toBe(403);
    }
    expect((await page.request.delete(`/api/projects/${project.projectId}/members/${user.id}`)).ok()).toBeTruthy();
    expect((await page.request.patch(`/api/projects/${project.projectId}`, { data: { visibility: "public" } })).ok()).toBeTruthy();
    await member.reload();
    await expect(member.locator(".td-topnav-title")).toHaveText(project.name);
    await expect(member.getByRole("button", { name: /^Rename project:/ })).toHaveCount(0);
  } finally { await context.close(); }
});

for (const scope of SCOPES) for (const width of [320, 390]) test(`title editing fits a ${width}px touch viewport in ${scope}`, async ({ page, project }) => {
  await useScope(page, scope);
  await page.setViewportSize({ width, height: 844 });
  await page.goto(`/p/${project.projectId}`);
  await page.getByRole("button", { name: `Rename project: ${project.name}` }).tap();
  const field = page.getByRole("textbox", { name: "Project name", exact: true });
  await expect(field).toBeFocused();
  const bounds = await field.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
  const searchBounds = await page.locator(".td-topnav-search").boundingBox();
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(searchBounds!.x);
  for (const control of await page.locator(".td-topnav button").all()) {
    if (!await control.isVisible()) continue;
    const controlBounds = await control.boundingBox();
    expect(controlBounds!.x).toBeGreaterThanOrEqual(0);
    expect(controlBounds!.x + controlBounds!.width).toBeLessThanOrEqual(width);
  }
  await checkA11y(page, `${scope} ${width}px title editor`);
  await page.screenshot({ path: `.tmp/project-title/${scope}-${width}px-editing.png` });
  await field.fill("A".repeat(120));
  await field.press("Enter");
  await expect(page.getByRole("button", { name: `Rename project: ${"A".repeat(120)}` })).toBeVisible();
  await page.screenshot({ path: `.tmp/project-title/${scope}-${width}px-saved.png` });
});

test("empty and unchanged names are ignored and typing respects the 120-character limit", async ({ page, project }) => {
  await page.goto(`/p/${project.projectId}`);
  const requests: string[] = [];
  page.on("request", (r) => { if (r.method() === "PATCH" && r.url().endsWith(`/projects/${project.projectId}`)) requests.push(r.postData() ?? ""); });
  const trigger = page.getByRole("button", { name: `Rename project: ${project.name}` });
  const field = page.getByRole("textbox", { name: "Project name", exact: true });
  for (const value of ["", "   ", project.name]) {
    await trigger.click();
    await field.fill(value);
    await field.press("Enter");
    await expect(trigger).toBeVisible();
  }
  expect(requests).toEqual([]);
  await trigger.click();
  await field.pressSequentially("A".repeat(121));
  await expect(field).toHaveValue("A".repeat(120));
  await field.press("Escape");
  expect(requests).toEqual([]);
});

test("custom titles render as text and rapid Enter submits once", async ({ page, project }) => {
  await page.goto(`/p/${project.projectId}`);
  const requests: string[] = [];
  page.on("request", (r) => { if (r.method() === "PATCH" && r.url().endsWith(`/projects/${project.projectId}`)) requests.push(r.postData() ?? ""); });
  for (const name of ["مرحبا بالعالم", "<script>window.titleInjected=true</script>", "O'Reilly; DROP TABLE projects; --"]) {
    await page.locator(".td-topnav-title").click();
    await page.getByRole("textbox", { name: "Project name", exact: true }).fill(name);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    // A second Enter reopens editing after focus restoration; cancel it without another write.
    const field = page.getByRole("textbox", { name: "Project name", exact: true });
    if (await field.count()) await field.press("Escape");
    await expect(page.getByRole("button", { name: `Rename project: ${name}`, exact: true })).toBeVisible();
    await expect.poll(async () => (await (await page.request.get(`/api/projects/${project.projectId}`)).json()).name).toBe(name);
  }
  expect(requests).toHaveLength(3);
  expect(await page.evaluate(() => Reflect.get(window, "titleInjected"))).toBeUndefined();
});

test("offline rename survives reload and syncs when reconnected", async ({ page, context, project }) => {
  await page.goto(`/p/${project.projectId}`);
  await page.getByRole("button", { name: `Rename project: ${project.name}` }).click();
  await context.setOffline(true);
  try {
    await page.getByRole("textbox", { name: "Project name", exact: true }).fill("Offline title");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Rename project: Offline title" })).toBeVisible();
    // Reconnect for the HTML shell, while keeping the queued PATCH paused across the reload.
    await page.route(`**/api/projects/${project.projectId}`, (route) => route.request().method() === "PATCH" ? route.abort() : route.continue());
    await context.setOffline(false);
    await page.reload();
    await expect(page.getByRole("button", { name: "Rename project: Offline title" })).toBeVisible();
    await page.unroute(`**/api/projects/${project.projectId}`);
    await context.setOffline(true);
    await context.setOffline(false);
    await expect.poll(async () => (await (await page.request.get(`/api/projects/${project.projectId}`)).json()).name).toBe("Offline title");
  } finally { await context.setOffline(false); }
});

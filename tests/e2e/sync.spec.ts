import { expect, test, type Page, type Request } from "@playwright/test";
import { nanoid } from "nanoid";

import { trackAccounts } from "./helpers";
import { apiOffline, editTitle, guestItem, itemCheckbox, serverItems } from "./sync-helpers";

const { watch, own } = trackAccounts(test);

async function changedElsewhere(page: Page) {
  await page.evaluate(() => {
    const channel = new BroadcastChannel("todoi-changes");
    channel.postMessage("changed");
    channel.close();
  });
}

test("create, edit and comment replay in dependency order after reopening", async ({ page, context }) => {
  const fixture = await guestItem(page);
  const reconnect = await apiOffline(context);
  await page.getByRole("button", { name: "Add an item", exact: true }).last().click();
  const input = page.getByRole("textbox", { name: "New item in To do", exact: true });
  await input.fill("Created offline");
  await input.press("Enter");
  await input.press("Escape");
  await page.getByText("Created offline", { exact: true }).click();
  await editTitle(page, "Edited offline before creation reaches server");
  const composer = page.getByRole("textbox", { name: "Comment", exact: true });
  await composer.fill("Comment depends on the new item");
  await composer.press("Enter");
  await expect(page.getByRole("banner").getByRole("button", { name: /3 edits/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("dialog")).toContainText("Edited offline before creation reaches server");
  const writes: string[] = [];
  context.on("request", (request) => {
    if (request.method() !== "GET" && request.url().includes("/api/") && request.headers()["x-todoi-operation-id"]) writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });
  await reconnect();
  await expect.poll(async () => (await serverItems(page, fixture.projectId)).find((item) => item.title === "Edited offline before creation reaches server")?.id).toBeTruthy();
  const made = (await serverItems(page, fixture.projectId)).find((item) => item.title === "Edited offline before creation reaches server")!;
  await expect.poll(async () => (await (await page.request.get(`/api/items/${made.id}/details`)).json()).comments.map((comment: { body: string }) => comment.body)).toEqual(["Comment depends on the new item"]);
  expect(writes).toEqual(["POST /api/items", `PATCH /api/items/${made.id}`, `POST /api/items/${made.id}/comments`]);
  await expect(composer).toHaveValue("");
  await expect(page.getByRole("dialog").getByText("Comment depends on the new item", { exact: true })).toBeVisible();
  await page.screenshot({ path: ".tmp/shots/sync-dependency-replay.png", animations: "disabled" });
});

test("acknowledged create, edit and comment survive offline reload without a followup snapshot", async ({ page, context }) => {
  const fixture = await guestItem(page);
  // Writes and actor checks succeed, but no subsequent snapshot can repair an old cache.
  await context.route("**/api/**", (route) => route.request().method() === "GET" && !new URL(route.request().url()).pathname.startsWith("/api/auth/") ? route.abort("internetdisconnected") : route.continue());
  await page.getByRole("button", { name: "Add an item", exact: true }).last().click();
  const input = page.getByRole("textbox", { name: "New item in To do", exact: true });
  await input.fill("Created before snapshots return");
  await input.press("Enter");
  await input.press("Escape");
  await page.getByText("Created before snapshots return", { exact: true }).click();
  await editTitle(page, "Acknowledged title without a fresh snapshot");
  const composer = page.getByRole("textbox", { name: "Comment", exact: true });
  await composer.fill("Acknowledged comment without a fresh snapshot");
  await composer.press("Enter");
  await expect.poll(async () => (await serverItems(page, fixture.projectId)).find((item) => item.title === "Acknowledged title without a fresh snapshot")?.id).toBeTruthy();
  const made = (await serverItems(page, fixture.projectId)).find((item) => item.title === "Acknowledged title without a fresh snapshot")!;
  await expect.poll(async () => (await (await page.request.get(`/api/items/${made.id}/details`)).json()).comments.map((comment: { body: string }) => comment.body)).toEqual(["Acknowledged comment without a fresh snapshot"]);
  await expect(composer).toHaveValue("");
  await expect.poll(() => page.evaluate(async () => {
    const { readWorkspace } = await import(new URL("/src/client/data/syncStorage.ts", location.origin).href) as typeof import("../../src/client/data/syncStorage");
    const ownerId = localStorage.getItem("td-sync-owner");
    return ownerId ? (await readWorkspace(ownerId))?.operations.length : null;
  })).toBe(0);
  const reconnect = await apiOffline(context);
  try {
    await page.reload();
    await expect(page.getByRole("dialog")).toContainText("Acknowledged title without a fresh snapshot");
    await expect(page.getByRole("dialog").getByText("Acknowledged comment without a fresh snapshot", { exact: true })).toBeVisible();
    await expect(composer).toHaveValue("");
    await expect(page.getByRole("banner").getByRole("button", { name: /saved on this device|couldn't sync/ })).toHaveCount(0);
  } finally {
    await reconnect();
  }
});

test("a queued new comment edit uses its creation version and preserves text after a remote conflict", async ({ page, context }) => {
  const fixture = await guestItem(page);
  await page.getByText("Sync fixture", { exact: true }).click();
  const reconnect = await apiOffline(context);
  const composer = page.getByRole("textbox", { name: "Comment", exact: true });
  await composer.fill("Comment created offline");
  await composer.press("Enter");
  const comment = page.locator(".td-comment:has(.td-comment-meta b)");
  await expect(comment).toHaveCount(1);
  await expect(comment).toContainText("Comment created offline");
  await comment.getByRole("button", { name: "Edit", exact: true }).click();
  await comment.getByRole("textbox", { name: "Edit comment", exact: true }).fill("Local comment edit kept for recovery");
  await comment.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => page.evaluate(async () => {
    const { readWorkspace } = await import(new URL("/src/client/data/syncStorage.ts", location.origin).href) as typeof import("../../src/client/data/syncStorage");
    const ownerId = localStorage.getItem("td-sync-owner");
    return ownerId ? (await readWorkspace(ownerId))?.operations.length : null;
  })).toBe(2);
  let createdId = "", createdVersion = 0;
  const editVersions: string[] = [];
  await page.route(`**/api/items/${fixture.id}/comments`, async (route) => {
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    const created = await response.json() as { id: string; version: number };
    createdId = created.id;
    createdVersion = created.version;
    // Another device writes after creation but before its acknowledgment reaches this queue.
    expect((await page.request.patch(`/api/comments/${created.id}`, { data: { body: "Remote comment edit" } })).ok()).toBe(true);
    await route.fulfill({ response });
  });
  await page.route("**/api/comments/*", async (route) => {
    editVersions.push(route.request().headers()["x-todoi-base-version"] ?? "");
    await route.continue();
  });
  await reconnect();
  await expect.poll(() => editVersions.length).toBe(1);
  expect(createdVersion).toBeGreaterThan(0);
  expect(editVersions).toEqual([String(createdVersion)]);
  await expect.poll(() => page.evaluate(async () => {
    const { readWorkspace } = await import(new URL("/src/client/data/syncStorage.ts", location.origin).href) as typeof import("../../src/client/data/syncStorage");
    const ownerId = localStorage.getItem("td-sync-owner");
    const operation = ownerId ? (await readWorkspace(ownerId))?.operations[0] : undefined;
    return operation && { path: operation.path, status: operation.status, body: JSON.parse(operation.body).body };
  })).toEqual({ path: `/api/comments/${createdId}`, status: 409, body: "Local comment edit kept for recovery" });
  const details = await (await page.request.get(`/api/items/${fixture.id}/details`)).json();
  expect(details.comments).toHaveLength(1);
  expect(details.comments[0].body).toBe("Remote comment edit");
  await expect(comment.getByRole("textbox", { name: "Edit comment", exact: true })).toHaveValue("Local comment edit kept for recovery");
});

test("a lost successful response reuses its operation id and does not repeat completion", async ({ page }) => {
  const fixture = await guestItem(page);
  const operationIds: string[] = [];
  let lose = true;
  await page.route(`**/api/items/${fixture.id}`, async (route) => {
    if (route.request().method() !== "PATCH") return route.continue();
    operationIds.push(route.request().headers()["x-todoi-operation-id"] ?? "");
    if (!lose) return route.continue();
    lose = false;
    expect((await route.fetch()).ok()).toBe(true);
    await route.abort("connectionreset");
  });
  await itemCheckbox(page, fixture.id).click();
  await expect.poll(async () => (await serverItems(page, fixture.projectId)).find((item) => item.id === fixture.id)?.done).toBe(true);
  await expect.poll(() => operationIds.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
  expect(operationIds[0]).not.toBe("");
  expect(new Set(operationIds).size).toBe(1);
  await expect(page.getByRole("banner").getByRole("button", { name: /saved on this device|couldn't sync/ })).toHaveCount(0);
  const activity = await (await page.request.get(`/api/activity?projectId=${fixture.projectId}`)).json() as Array<{ itemId: string; text: string }>;
  expect(activity.filter((entry) => entry.itemId === fixture.id && /completed/.test(entry.text))).toHaveLength(1);
});

test("incoming snapshots preserve a pending local title and show unrelated remote edits", async ({ page }) => {
  const fixture = await guestItem(page);
  await page.goto(`/p/${fixture.projectId}?v=list&item=${fixture.id}`);
  // Only writes are blocked: snapshots continue reaching the app.
  await page.route(`**/api/items/${fixture.id}`, (route) => route.request().method() === "PATCH" ? route.abort("internetdisconnected") : route.continue());
  await editTitle(page, "My unsent local title");
  await expect(page.getByRole("dialog")).toContainText("My unsent local title");
  expect((await page.request.patch(`/api/items/${fixture.id}`, { data: { description: "Remote description changed" } })).ok()).toBe(true);
  const fetched = page.waitForResponse((response) => response.request().method() === "GET" && new URL(response.url()).pathname === "/api/items");
  await changedElsewhere(page);
  await fetched;
  await expect(page.getByRole("dialog")).toContainText("My unsent local title");
  await expect(page.getByRole("dialog").getByTitle("Click to edit description")).toContainText("Remote description changed");
  await page.screenshot({ path: ".tmp/shots/sync-pending-snapshot.png", animations: "disabled" });
});

test("a stale in-flight snapshot cannot replace an acknowledged change or its offline cache", async ({ page, context }) => {
  const fixture = await guestItem(page);
  let release!: () => void;
  let observed!: () => void;
  let finished!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { observed = resolve; });
  const settled = new Promise<void>((resolve) => { finished = resolve; });
  let first = true;
  let staleRequest: Request | undefined;
  let cancelled = false;
  page.on("requestfailed", (request) => { if (request === staleRequest) cancelled = true; });
  await page.route((url) => url.pathname === "/api/items" && url.searchParams.get("projectId") === fixture.projectId, async (route) => {
    if (!first) return route.continue();
    first = false;
    staleRequest = route.request();
    const response = await route.fetch();
    expect((await response.json() as Array<{ id: string; done: boolean }>).find((item) => item.id === fixture.id)?.done).toBe(false);
    observed();
    await held;
    // The browser may already have cancelled this request when the acknowledgement arrived.
    await route.fulfill({ response }).catch(() => undefined);
    finished();
  });
  try {
    await changedElsewhere(page);
    await started;
    await itemCheckbox(page, fixture.id).click();
    await expect.poll(async () => (await serverItems(page, fixture.projectId)).find((item) => item.id === fixture.id)?.done).toBe(true);
    await expect.poll(() => cancelled).toBe(true);
    await expect(itemCheckbox(page, fixture.id, true)).toBeChecked();
    release();
    await settled;
    const reconnect = await apiOffline(context);
    try {
      await page.reload();
      await expect(itemCheckbox(page, fixture.id, true)).toBeChecked();
      await expect(page.getByRole("banner").getByRole("button", { name: /saved on this device|couldn't sync/ })).toHaveCount(0);
    } finally {
      await reconnect();
    }
  } finally {
    release();
  }
});

test("a concurrent edit keeps local text through reload and requires explicit recovery", async ({ page, context }) => {
  const fixture = await guestItem(page);
  await page.goto(`/p/${fixture.projectId}?v=list&item=${fixture.id}`);
  const reconnect = await apiOffline(context);
  await editTitle(page, "Local title to recover");
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  expect((await page.request.patch(`/api/items/${fixture.id}`, { data: { title: "Someone else's title", description: "Remote fields remain intact during recovery" } })).ok()).toBe(true);
  await reconnect();
  await expect(page.getByRole("banner").getByRole("button", { name: /couldn't sync/ })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Local title to recover", { exact: true })).toBeVisible();
  expect((await serverItems(page, fixture.projectId)).find((item) => item.id === fixture.id)?.title).toBe("Someone else's title");
  await page.getByRole("banner").getByRole("button", { name: /couldn't sync/ }).click();
  await page.getByRole("menuitem", { name: "Storage & sync settings" }).click();
  await expect(page.getByRole("textbox", { name: "Saved change", exact: true })).toHaveValue("Local title to recover");
  await page.screenshot({ path: ".tmp/shots/sync-conflict-recovery.png", animations: "disabled" });
  await page.getByRole("button", { name: "Apply my change", exact: true }).click();
  const confirmation = page.getByRole("alertdialog");
  await expect(confirmation).toContainText("Apply your change over the latest version?");
  await confirmation.getByRole("button", { name: "Apply my change", exact: true }).click();
  await expect.poll(async () => (await serverItems(page, fixture.projectId)).find((item) => item.id === fixture.id)?.title).toBe("Local title to recover");
  expect((await serverItems(page, fixture.projectId)).find((item) => item.id === fixture.id)?.description).toBe("Remote fields remain intact during recovery");
  await expect(page.getByRole("textbox", { name: "Saved change", exact: true })).toHaveCount(0);
});

test("two tabs drain one durable queue without duplicate requests", async ({ page, context }) => {
  const fixture = await guestItem(page);
  const other = await context.newPage();
  await other.goto(`/p/${fixture.projectId}?v=list`);
  await expect(itemCheckbox(other, fixture.id)).toBeVisible();
  const reconnect = await apiOffline(context);
  await itemCheckbox(page, fixture.id).click();
  await expect(page.getByRole("banner").getByRole("button", { name: /1 edit/ })).toBeVisible();
  const writes: string[] = [];
  context.on("request", (request) => { if (request.method() === "PATCH" && new URL(request.url()).pathname === `/api/items/${fixture.id}`) writes.push(request.headers()["x-todoi-operation-id"] ?? ""); });
  await reconnect();
  await expect.poll(async () => (await serverItems(page, fixture.projectId)).find((item) => item.id === fixture.id)?.done).toBe(true);
  await expect(itemCheckbox(other, fixture.id, true)).toBeChecked();
  await expect(page.getByRole("banner").getByRole("button", { name: /1 edit|couldn't sync/ })).toHaveCount(0);
  await expect(other.getByRole("banner").getByRole("button", { name: /1 edit|couldn't sync/ })).toHaveCount(0);
  expect(writes).toHaveLength(1);
  expect(writes[0]).not.toBe("");
});

test("an expired session retains saved text and retries only after the original session returns", async ({ page, context }) => {
  const fixture = await guestItem(page);
  await page.goto(`/p/${fixture.projectId}?v=list&item=${fixture.id}`);
  const reconnect = await apiOffline(context);
  await editTitle(page, "Saved while my session expired");
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  const cookies = await context.cookies();
  await context.clearCookies();
  await reconnect();
  await expect(page.getByRole("banner").getByRole("button", { name: /couldn't sync/ })).toBeVisible();
  await context.addCookies(cookies);
  expect((await serverItems(page, fixture.projectId)).find((item) => item.id === fixture.id)?.title).toBe("Sync fixture");
  await page.getByRole("banner").getByRole("button", { name: /couldn't sync/ }).click();
  await page.getByRole("menuitem", { name: "Storage & sync settings" }).click();
  await expect(page.getByRole("textbox", { name: "Saved change", exact: true })).toHaveValue("Saved while my session expired");
  await page.screenshot({ path: ".tmp/shots/sync-session-expired.png", animations: "disabled" });
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect.poll(async () => (await serverItems(page, fixture.projectId)).find((item) => item.id === fixture.id)?.title).toBe("Saved while my session expired");
});

test("revoked project access removes cached private content including after offline reload", async ({ page, browser }) => {
  const fixture = await guestItem(page, "Private title must disappear");
  const registered = await page.request.post("/api/auth/sign-up/email", { headers: { Origin: new URL(page.url()).origin }, data: { name: "Sync permission owner", email: `sync-permission-${nanoid()}@example.test`, password: "sync-permission-password" } });
  expect(registered.ok(), await registered.text()).toBe(true);
  own((await registered.json()).user.id as string);
  await page.reload();
  const memberContext = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  watch(memberContext);
  try {
    const member = await memberContext.newPage();
    await member.goto("/");
    await expect(member).toHaveURL(/\/p\//);
    const memberRegistration = await member.request.post("/api/auth/sign-up/email", { headers: { Origin: new URL(member.url()).origin }, data: { name: "Sync permission member", email: `sync-member-${nanoid()}@example.test`, password: "sync-permission-password" } });
    expect(memberRegistration.ok(), await memberRegistration.text()).toBe(true);
    const memberUser = (await (await member.request.get("/api/auth/get-session")).json()).user.id as string;
    own(memberUser);
    expect((await page.request.put(`/api/projects/${fixture.projectId}/members/${memberUser}`, { data: { role: "editor" } })).ok()).toBe(true);
    await member.goto(`/p/${fixture.projectId}?v=list&item=${fixture.id}`);
    await expect(member.getByRole("dialog")).toContainText("Private title must disappear");
    const second = await memberContext.newPage();
    await second.goto(member.url());
    await expect(second.getByRole("dialog")).toContainText("Private title must disappear");
    // This tab cannot learn the refusal from a request; the shared storage purge must clear it.
    await second.route("**/api/**", (route) => route.abort("internetdisconnected"));
    await second.evaluate(() => {
      Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
      window.dispatchEvent(new Event("offline"));
    });
    expect((await page.request.delete(`/api/projects/${fixture.projectId}/members/${memberUser}`)).ok()).toBe(true);
    await changedElsewhere(member);
    await expect(member.getByText("Private title must disappear", { exact: true })).toHaveCount(0);
    await expect(second.getByText("Private title must disappear", { exact: true })).toHaveCount(0);
    await apiOffline(memberContext);
    await member.reload();
    await expect(member.getByText("Private title must disappear", { exact: true })).toHaveCount(0);
    await expect(member.getByText("Couldn't load this project", { exact: true })).toBeVisible();
    await member.screenshot({ path: ".tmp/shots/sync-permission-revoked.png", animations: "disabled" });
  } finally { await memberContext.close(); }
});

async function rejectedGuestTitle(page: Page) {
  const fixture = await guestItem(page);
  const before = (await (await page.request.get("/api/auth/get-session")).json()).user as { id: string; isAnonymous: boolean };
  expect(before.isAnonymous).toBe(true);
  const savedTitle = "Guest title retained until account linking is safe";
  const itemPath = `**/api/items/${fixture.id}`;
  await page.route(itemPath, (route) => route.request().method() === "PATCH" ? route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ error: "Review this saved guest change" }) }) : route.continue());
  await page.goto(`/p/${fixture.projectId}?v=list&item=${fixture.id}`);
  const rejected = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/items/${fixture.id}` && response.request().method() === "PATCH" && response.status() === 422);
  await editTitle(page, savedTitle);
  await rejected;
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("banner").getByRole("button", { name: /couldn't sync/ })).toBeVisible();
  return { fixture, before, savedTitle, itemPath };

}

for (const flow of [
  { path: "/login", endpoint: "/api/auth/sign-in/email", submit: "Log in" },
  { path: "/signup", endpoint: "/api/auth/sign-up/email", submit: "Create account" },
] as const) test(`guest ${flow.path} waits for retained changes before submitting authentication`, async ({ page }) => {
  const { fixture, before, savedTitle, itemPath } = await rejectedGuestTitle(page);
  let submissions = 0;
  await page.route(`**${flow.endpoint}`, (route) => {
    submissions++;
    return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ message: "Authentication reached the test endpoint", code: "TEST_ENDPOINT" }) });
  });
  const fillAuth = async () => {
    await page.goto(flow.path);
    if (flow.path === "/signup") await page.getByRole("textbox", { name: "Name", exact: true }).fill("Guest sync test");
    await page.getByRole("textbox", { name: "Email", exact: true }).fill("guest-sync-test@example.test");
    await page.getByLabel(/^Password/).fill("guest-sync-password");
    await page.getByRole("button", { name: flow.submit, exact: true }).click();
  };
  await fillAuth();
  await expect(page.getByRole("alert")).toContainText("Sync your saved guest changes before signing in");
  expect(submissions).toBe(0);
  expect((await (await page.request.get("/api/auth/get-session")).json()).user.id).toBe(before.id);
  expect((await serverItems(page, fixture.projectId)).find((item) => item.id === fixture.id)?.title).toBe("Sync fixture");

  // Account linking stays blocked until the retained operation has really reached the server.
  await page.goto("/settings?s=storage");
  await expect(page.getByRole("textbox", { name: "Saved change", exact: true })).toHaveValue(savedTitle);
  await page.unroute(itemPath);
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect.poll(async () => (await serverItems(page, fixture.projectId)).find((item) => item.id === fixture.id)?.title).toBe(savedTitle);
  await expect(page.getByRole("textbox", { name: "Saved change", exact: true })).toHaveCount(0);

  await fillAuth();
  await expect.poll(() => submissions).toBe(1);
  await expect(page.getByRole("alert")).toContainText("Authentication reached the test endpoint");
  expect((await (await page.request.get("/api/auth/get-session")).json()).user.id).toBe(before.id);
});


test("an unavailable session check after auth page reload cannot strand saved guest changes", async ({ page }) => {
  const { fixture, before, savedTitle } = await rejectedGuestTitle(page);
  const sessionPath = "**/api/auth/get-session";
  await page.route(sessionPath, (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "Session service unavailable" }) }));
  let submissions = 0;
  await page.route("**/api/auth/sign-in/email", (route) => {
    submissions++;
    return route.fulfill({ status: 401, contentType: "application/json", body: JSON.stringify({ message: "Authentication reached the test endpoint", code: "TEST_ENDPOINT" }) });
  });
  // This document has not opened the workspace, so the durable queue must not be assumed empty.
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("guest-sync-test@example.test");
  await page.getByLabel(/^Password/).fill("guest-sync-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("check your current session");
  expect(submissions).toBe(0);
  expect((await (await page.request.get("/api/auth/get-session")).json()).user.id).toBe(before.id);
  expect((await serverItems(page, fixture.projectId)).find((item) => item.id === fixture.id)?.title).toBe("Sync fixture");
  await page.unroute(sessionPath);
  await page.goto("/settings?s=storage");
  await expect(page.getByRole("textbox", { name: "Saved change", exact: true })).toHaveValue(savedTitle);
});

import { expect, type BrowserContext, type Page, type TestType } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { loadEnvFile } from "node:process";
import { Pool } from "pg";

import { DEV_USER } from "../../src/shared/devUser";
import { APPEARANCE_STORAGE_KEY, APPEARANCE_STORAGE_VERSION, MODE_IDS, THEME_IDS } from "../../src/client/design/core/themes";

export type Scope = `${(typeof THEME_IDS)[number]}-${(typeof MODE_IDS)[number]}`;
export const SCOPES: Scope[] = THEME_IDS.flatMap((t) => MODE_IDS.map((m) => `${t}-${m}` as Scope));

/** Sign in through the API; the cookie jar is shared with the page. */
export async function signIn(page: Page) {
  const r = await page.request.post("/api/auth/sign-in/email", { data: DEV_USER });
  expect(r.ok(), "sign-in").toBeTruthy();
}

/** Persist a theme × mode before the app boots — the Appearance store's own key and version; the store fills in the rest. */
export async function useScope(page: Page, scope: Scope) {
  const [theme, mode] = scope.split("-");
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key!, value!),
    [APPEARANCE_STORAGE_KEY, JSON.stringify({ state: { theme, mode }, version: APPEARANCE_STORAGE_VERSION })],
  );
}

export async function expectScope(page: Page, scope: Scope) {
  const [theme, mode] = scope.split("-");
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme!);
  await expect(page.locator("html")).toHaveAttribute("data-mode", mode!);
}

/** The seeded project every screen test opens (looked up once per worker). */
let seeded: Promise<string> | undefined;
export function seedProjectId(page: Page): Promise<string> {
  seeded ??= (async () => {
    const groups = (await (await page.request.get("/api/groups")).json()) as Array<{ projects: Array<{ id: string; name: string }> }>;
    const p = groups.flatMap((g) => g.projects).find((x) => /website/i.test(x.name)) ?? groups[0]?.projects[0];
    if (!p) throw new Error("no seeded project");
    return p.id;
  })();
  return seeded;
}

export async function firstItemId(page: Page, projectId: string): Promise<string> {
  const items = (await (await page.request.get(`/api/items?projectId=${projectId}`)).json()) as Array<{ id: string; parentItemId: string | null; done: boolean }>;
  const it = items.find((i) => !i.parentItemId && !i.done) ?? items[0];
  if (!it) throw new Error("no seeded items");
  return it.id;
}

/** Fail on serious / critical WCAG A + AA violations; everything else is reported in the test output. */
export async function checkA11y(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).disableRules(["color-contrast"]).analyze();
  const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const describe = (v: (typeof results.violations)[number]) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(", ")}`;
  if (results.violations.length) console.log(`[axe ${label}] ${results.violations.map(describe).join("\n  ")}`);
  expect(blocking.map(describe), `axe: ${label}`).toEqual([]);
}

export interface Screen {
  name: string;
  /** Where to go; may set things up first and hand back a cleanup */
  open: (page: Page) => Promise<(() => Promise<void>) | void>;
  /** The element that proves the screen is up (roles the components expose) */
  ready: (page: Page) => ReturnType<Page["getByRole"]>;
}

/** One screen in one scope: the scope is on <html>, the screen is up, axe is clean, the baseline matches. */
export async function gate(page: Page, scope: Scope, screen: Screen) {
  const cleanup = await screen.open(page);
  try {
    await expectScope(page, scope);
    await expect(screen.ready(page)).toBeVisible();
    await settle(page);
    await checkA11y(page, `${scope} ${screen.name}`);
    await expect(page).toHaveScreenshot(`${scope}-${screen.name}.png`);
  } finally {
    await cleanup?.();
  }
}

/** Wait for data to settle and hide anything that moves between runs (toasts, shortcut hints, carets). */
export async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.addStyleTag({ content: '[role="status"].td-toast, .td-hint { visibility: hidden !important } * { caret-color: transparent !important }' });
  await page.waitForTimeout(300);
}

if (!process.env.DATABASE_URL) loadEnvFile(".env");

/**
 * Accounts a test's browsers create (guests, sign-ups) are deleted after each test with their
 * workspaces and uploaded bytes. The test's own context is watched; `watch` adds more, `own` adds an id.
 */
export function trackAccounts(test: TestType<any, any>) {
  const ownedUsers = new Set<string>();
  const responses: Promise<void>[] = [];
  const watch = (context: BrowserContext) => {
    context.on("response", (response) => {
      // Only accounts born in this test: guests (anonymous) and fresh sign-ups — never an existing
      // account a test signs in to (the seeded dev user owns the sample workspace).
      if (!/\/api\/auth\/(sign-up|get-session)/.test(response.url())) return;
      responses.push(response.json().then((data) => { if (data?.user?.id && (data.user.isAnonymous || /sign-up/.test(response.url()))) ownedUsers.add(data.user.id); }).catch(() => undefined));
    });
  };
  test.beforeEach(({ context }: { context: BrowserContext }) => { ownedUsers.clear(); responses.length = 0; watch(context); });
  test.afterEach(async () => {
    await Promise.all(responses);
    if (!ownedUsers.size) return;
    // Remove only identities created by these tests, their workspaces, and their uploaded bytes.
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query("begin");
      // Belt and braces: never the seeded dev account, whatever was recorded.
      const ids = (await client.query("select id from users where id = any($1) and email <> $2", [[...ownedUsers], DEV_USER.email])).rows.map((u) => u.id as string);
      const { rows: ps } = await client.query("select id from projects where group_id in (select id from groups where owner_id = any($1))", [ids]);
      const projectIds = ps.map((p) => p.id);
      const { rows: files } = await client.query("select storage_key from attachments where item_id in (select id from items where project_id = any($1) or list_id in (select id from lists where user_id = any($2)))", [projectIds, ids]);
      await client.query("delete from items where project_id = any($1) or list_id in (select id from lists where user_id = any($2))", [projectIds, ids]);
      for (const table of ["activity", "saved_views", "labels", "invites", "lists", "members"]) {
        await client.query(`delete from ${table} where project_id = any($1)`, [projectIds]);
      }
      await client.query("delete from projects where id = any($1)", [projectIds]);
      await client.query("delete from lists where user_id = any($1)", [ids]);
      await client.query("delete from groups where owner_id = any($1)", [ids]);
      await client.query("delete from users where id = any($1)", [ids]);
      await client.query("commit");
      await Promise.all(files.map((f) => rm(join(process.env.UPLOAD_DIR ?? ".data/uploads", f.storage_key), { force: true })));
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally { client.release(); await pool.end(); }
  });
  return { watch, own: (id: string) => void ownedUsers.add(id) };
}

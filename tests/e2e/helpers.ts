import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

export const DEV_USER = { email: "flo@helicopterseurope.com", password: "todoi-dev-password" };
export const THEMES = ["standard", "minimal"] as const;
export const MODES = ["dark", "light"] as const;
export type Scope = `${(typeof THEMES)[number]}-${(typeof MODES)[number]}`;
export const SCOPES: Scope[] = THEMES.flatMap((t) => MODES.map((m) => `${t}-${m}` as Scope));

/** Sign in through the API; the cookie jar is shared with the page. */
export async function signIn(page: Page) {
  const r = await page.request.post("/api/auth/sign-in/email", { data: DEV_USER });
  expect(r.ok(), "sign-in").toBeTruthy();
}

/** Persist a theme × mode before the app boots (the same localStorage key the Style menu writes). */
export async function useScope(page: Page, scope: Scope) {
  const [theme, mode] = scope.split("-");
  await page.addInitScript(
    ([t, m]) => {
      localStorage.setItem("td-appearance", JSON.stringify({ state: { theme: t, mode: m, slots: {}, themePrefs: {}, showItemIds: true, showLabels: true, statusDisplay: "informative" }, version: 1 }));
      localStorage.setItem("td-saved-views-open", "0");
      localStorage.setItem("td-prefs", JSON.stringify({ state: { showTips: false }, version: 1 }));
    },
    [theme, mode],
  );
}

export async function expectScope(page: Page, scope: Scope) {
  const [theme, mode] = scope.split("-");
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme!);
  await expect(page.locator("html")).toHaveAttribute("data-mode", mode!);
}

/** The seeded project every screen test opens. */
export async function seedProjectId(page: Page): Promise<string> {
  const groups = (await (await page.request.get("/api/groups")).json()) as Array<{ projects: Array<{ id: string; name: string }> }>;
  const p = groups.flatMap((g) => g.projects).find((x) => /website/i.test(x.name)) ?? groups[0]?.projects[0];
  if (!p) throw new Error("no seeded project");
  return p.id;
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

/** Wait for data to settle and hide anything that moves between runs. */
export async function settle(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.addStyleTag({ content: ".td-toast, .td-hint, .td-shortcut-hint { visibility: hidden !important } * { caret-color: transparent !important }" });
  await page.waitForTimeout(300);
}

import { serve } from "@hono/node-server";
import { AxeBuilder } from "@axe-core/playwright";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { rmSync } from "node:fs";
import { dirname } from "node:path";
import { expect, test, type Locator } from "@playwright/test";

import { Jobs, type JobEvent } from "../src/server/jobs";
import { createApp } from "../src/server/main";
import { makeFixture } from "./fixture";

test.use({ reducedMotion: "reduce" });

async function logWorld(draft = false) {
  const fx = makeFixture();
  const jobs = new Jobs(fx.ctx);
  for (let i = 0; i < 12; i++) jobs.finish(jobs.create("status", `Earlier check ${i}`), "done");
  const job = jobs.create("run", "Sync sign-up and password reset", {
    ...(draft ? { app: { worktree: fx.repo, branch: "design-sync/example-draft", base: "123456789", into: "main", commits: [], state: "ready" as const, review: { findings: [{ rule: "aria" as const, file: "AuthShell.tsx", detail: "Review its keyboard behavior" }] } } } : {}),
    steps: [...Array.from({ length: 35 }, (_, i) => ({ id: `step-${i}`, title: `Review and update component ${i}`, kind: "port-app", target: "app" as const, state: "done" as const })), { id: "upload", title: "Upload staged files", kind: "upload", target: "design", state: "pending" }],
    staged: Array.from({ length: 30 }, (_, i) => ({ path: `components/auth/LongComponentName${i}.jsx`, status: "changed" })),
    events: Array.from({ length: 250 }, (_, i) => ({ at: "2026-10-08T10:58:00Z", level: i % 4 ? "tool" : "ai", text: `Entry ${i}: Read /private/var/folders/long-worktree-path/src/client/design/auth/AuthShell.tsx\n${"LongUnbrokenPath".repeat(12)}` })),
  });
  jobs.finish(job, "awaiting-approval");
  const empty = jobs.create("status", "Empty check");
  jobs.finish(empty, "done");
  const tool = createApp(fx.ctx, { fake: { designDir: fx.designNowDir } });
  // A controllable real SSE connection exercises entries arriving while the reader scrolls.
  let send: ((event: JobEvent) => Promise<void>) | undefined;
  const app = new Hono().get(`/api/jobs/${job.id}/events`, (c) => streamSSE(c, async (stream) => {
    await stream.writeSSE({ event: "job", data: JSON.stringify(job) });
    send = async (event) => {
      job.events.push(event);
      await stream.writeSSE({ event: "event", data: JSON.stringify({ job: { ...job, events: [] }, event }) });
    };
    await new Promise<void>((resolve) => stream.onAbort(resolve));
  }));
  const { server, url } = await new Promise<{ server: ReturnType<typeof serve>; url: string }>((resolve) => {
    const listener = serve({ fetch: (req) => new URL(req.url).pathname === `/api/jobs/${job.id}/events` ? app.fetch(req) : tool.fetch(req), port: 0, hostname: "127.0.0.1" }, (info) => resolve({ server: listener, url: `http://127.0.0.1:${info.port}` }));
  });
  return {
    url, job, empty,
    append: async (text: string) => {
      expect(send).toBeDefined();
      await send!({ at: new Date().toISOString(), level: "ai", text });
    },
    close: async () => {
      if ("closeAllConnections" in server) server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(dirname(fx.repo), { recursive: true, force: true });
    },
  };
}

const atLatest = (log: Locator) => log.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop < 4);

test("sidebar wheel and keyboard scrolling reach long approvals and log; expanded log uses the panel", async ({ page }, testInfo) => {
  const world = await logWorld();
  try {
    await page.goto(`${world.url}/?job=${world.job.id}`);
    const panel = page.getByRole("complementary", { name: "Activity" });
    const body = panel.getByRole("region", { name: "Activity details" });
    const log = panel.getByRole("list", { name: "Log", exact: true });
    await expect(log.locator("li")).toHaveCount(250);
    await body.hover();
    await page.mouse.wheel(0, 700);
    await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
    await body.focus();
    await page.keyboard.press("PageDown");
    await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(800);
    await expect(panel.getByRole("button", { name: "Close activity" })).toBeInViewport();
    expect(await log.evaluate((el) => el.clientHeight)).toBeGreaterThan(250);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await panel.getByRole("button", { name: "Jobs", exact: true }).click();
    await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBe(0);
    await panel.getByRole("checkbox", { name: /components\/auth\/LongComponentName0\.jsx/ }).uncheck();
    const jump = panel.getByRole("button", { name: "Jump to log" });
    await jump.focus();
    await page.keyboard.press("Enter");
    await expect(log).toBeFocused();
    await expect(panel.getByRole("button", { name: "Expand log" })).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath("sidebar.png"), animations: "disabled" });
    await panel.getByRole("button", { name: "Expand log" }).click();
    await expect(panel.getByRole("button", { name: "Back to run" })).toHaveAttribute("aria-expanded", "true");
    expect(await log.evaluate((el) => el.clientHeight)).toBeGreaterThan(600);
    await expect(panel.getByRole("heading", { name: "Upload to Claude Design" })).toBeHidden();
    const narrowWidth = (await panel.boundingBox())!.width;
    await panel.getByRole("button", { name: "Widen activity" }).click();
    await expect.poll(async () => (await panel.boundingBox())!.width).toBeGreaterThan(narrowWidth + 200);
    for (const [name, width, height, mode] of [["wide", 1440, 900, "light"], ["dark", 1440, 900, "dark"], ["phone", 390, 844, "light"], ["zoom", 720, 500, "light"], ["short", 1100, 360, "light"]] as const) {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme: mode });
      await expect(panel.getByRole("button", { name: "Back to run" })).toBeInViewport();
      await expect(panel.getByRole("button", { name: "First entry" })).toBeInViewport();
      expect(await log.evaluate((el) => el.clientHeight)).toBeGreaterThan(100);
      expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect(await log.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const axe = await new AxeBuilder({ page }).include(".cds-panel").analyze();
      expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`${name}.png`), animations: "disabled" });
    }
    await panel.getByRole("button", { name: "Back to run" }).click();
    await expect(panel.locator(".cds-jobview-head h3")).toBeFocused();
    await expect(panel.locator(".cds-jobview-head h3")).toBeInViewport();
    await expect(panel.getByRole("checkbox", { name: /components\/auth\/LongComponentName0\.jsx/ })).not.toBeChecked();
    await panel.getByRole("button", { name: "Jobs", exact: true }).click();
    await panel.getByRole("button", { name: /Show older jobs/ }).click();
    await expect(panel.getByRole("navigation", { name: "Jobs" }).getByRole("button")).toHaveCount(14);
    await panel.getByRole("navigation", { name: "Jobs" }).getByRole("button", { name: /Earlier check 0 / }).click();
    await expect(panel.locator(".cds-jobview-head h3")).toHaveText("Earlier check 0");
    await panel.getByRole("button", { name: "Close activity" }).click();
    await expect(panel).toHaveCount(0);
  } finally { await page.goto("about:blank"); await world.close(); }
});

test("opening draft review leaves an expanded log and preserves review choices", async ({ page }) => {
  const world = await logWorld(true);
  try {
    await page.goto(`${world.url}/?job=${world.job.id}`);
    const panel = page.getByRole("complementary", { name: "Activity" });
    const finding = panel.getByRole("checkbox", { name: /Review its keyboard behavior/ });
    await finding.check();
    await panel.getByRole("button", { name: "Jump to log" }).click();
    await panel.getByRole("button", { name: "Expand log" }).click();
    await page.locator(".cds-bar").getByRole("button", { name: /^Review the draft/ }).click();
    await expect(panel.getByRole("button", { name: "Back to run" })).toHaveCount(0);
    await expect(finding).toBeChecked();
    await expect(panel.locator(".cds-review h5")).toBeFocused();
    await expect(panel.locator(".cds-review h5")).toBeInViewport();
  } finally { await page.goto("about:blank"); await world.close(); }
});

test("first/latest controls, live follow and copy work without pulling a reader away from old entries", async ({ page, context }) => {
  const world = await logWorld();
  try {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(`${world.url}/?job=${world.job.id}`);
    const panel = page.getByRole("complementary", { name: "Activity" });
    const log = panel.getByRole("list", { name: "Log", exact: true });
    await expect(log.locator("li")).toHaveCount(250);
    await panel.getByRole("button", { name: "Jump to log" }).click();
    await panel.getByRole("button", { name: "Expand log" }).click();
    await expect.poll(() => atLatest(log)).toBe(true);
    await panel.getByRole("button", { name: "First entry" }).click();
    await expect.poll(() => log.evaluate((el) => el.scrollTop)).toBe(0);
    await expect(panel.getByRole("button", { name: "Follow live log: off" })).toHaveAttribute("aria-pressed", "false");
    await world.append("An entry arriving while reading the start");
    await expect(log.locator("li")).toHaveCount(251);
    expect(await log.evaluate((el) => el.scrollTop)).toBe(0);
    await panel.getByRole("button", { name: "Back to run" }).click();
    await panel.getByRole("button", { name: "Expand log" }).click();
    expect(await log.evaluate((el) => el.scrollTop)).toBe(0);
    await panel.getByRole("button", { name: "Latest entry" }).click();
    await world.append("A live entry to follow");
    await expect(log.locator("li")).toHaveCount(252);
    await expect.poll(() => atLatest(log)).toBe(true);
    await log.hover();
    await page.mouse.wheel(0, -500);
    await expect(panel.getByRole("button", { name: "Follow live log: off" })).toBeVisible();
    const before = await log.evaluate((el) => el.scrollTop);
    await world.append("Reader stays at their chosen scroll position");
    await expect(log.locator("li")).toHaveCount(253);
    expect(await log.evaluate((el) => el.scrollTop)).toBe(before);
    await panel.getByRole("button", { name: "Follow live log: off" }).click();
    await expect.poll(() => atLatest(log)).toBe(true);
    await panel.getByRole("button", { name: "Follow live log: on" }).click();
    const paused = await log.evaluate((el) => el.scrollTop);
    await world.append("Explicitly paused at latest");
    await expect(log.locator("li")).toHaveCount(254);
    expect(await log.evaluate((el) => el.scrollTop)).toBe(paused);
    await panel.getByRole("button", { name: "Copy log", exact: true }).click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain("Entry 0:");
    expect(copied).toContain("Entry 249:");
    expect(copied).toContain("Explicitly paused at latest");
    await panel.getByRole("button", { name: "Jobs", exact: true }).click();
    await panel.getByRole("navigation", { name: "Jobs" }).getByRole("button", { name: /Empty check/ }).click();
    await expect(log).toContainText("No log entries yet");
    await expect(panel.getByRole("button", { name: "First entry" })).toBeDisabled();
  } finally { await page.goto("about:blank"); await world.close(); }
});

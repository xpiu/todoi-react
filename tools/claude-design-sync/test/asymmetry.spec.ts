// The report's challenges 3.1–3.3/5.1–5.3 in the GUI: references stay references, drafts wait for review,
// and the kit side shows pictures, not only diffs. Screenshots land in .tmp/20261007_report_fixes.
import { serve } from "@hono/node-server";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

import { TOOL_DIR } from "../src/engine/config";
import { createApp } from "../src/server/main";
import { makeFixture } from "./fixture";

const shots = join(TOOL_DIR, "../../.tmp/20261007_report_fixes");
const row = (page: Page, title: string) => page.locator(".cds-row", { has: page.getByRole("button", { name: title, exact: true }) });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("cds-init")) {
      localStorage.clear();
      sessionStorage.setItem("cds-init", "1");
    }
  });
});

test("kit screens are references: read beside the App screen, never ported (3.1)", async ({ page }) => {
  await page.goto("/");
  const screens = row(page, "UI kit screens");
  await expect(screens.locator(".cds-status").first()).toHaveText("changed in Design, not ported");
  await expect(screens.locator(".cds-rail-note").first()).toHaveText("Reference only");
  await expect(page.locator(".cds-plan-sum strong")).toContainText("2 reference");
  // only Skip is available on its rail, and the plan-wide counts leave it out
  for (const d of ["Into the App", "Full sync", "Into Design"]) await expect(screens.getByRole("radio", { name: d }).first()).toHaveAttribute("aria-disabled", "true");
  await expect(screens.getByRole("radio", { name: "Skip" }).first()).toHaveAttribute("aria-checked", "true");

  await screens.getByRole("button", { name: "UI kit screens", exact: true }).click();
  const unit = screens.locator(".cds-unit", { hasText: "Project screen (Board)" });
  await expect(unit).toContainText("Compare with (never written):");
  await expect(unit).toContainText("Design references are read, never ported.");
  await expect(unit).toContainText("src/client/app/ProjectScreen.tsx");
  await expect(unit.getByRole("link", { name: "Open the kit app" })).toHaveAttribute("href", /\/kit\/snapshot\/[^/]+\/ui_kits\/todoi\/index\.html$/);
  await expect(screens.locator(".cds-proposal")).toContainText("Nothing runs: Design references are read, never ported.");
  mkdirSync(shots, { recursive: true });
  await screens.screenshot({ path: join(shots, "3.1-screen-reference.png"), animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await screens.screenshot({ path: join(shots, "3.1-screen-reference-mobile.png"), animations: "disabled" });
  await page.setViewportSize({ width: 1440, height: 900 });

  // the kit app opens from the snapshot
  const res = await page.request.get(await unit.getByRole("link", { name: "Open the kit app" }).getAttribute("href") ?? "");
  expect(res.ok()).toBe(true);

  // the Mapping page says why
  await page.goto("/mapping");
  const lane = page.locator(".cds-map-lane", { has: page.getByRole("button", { name: "Screens", exact: true }) });
  await expect(lane.locator(".cds-map-tech")).toHaveText("Reference only");
  await lane.getByRole("button", { name: "Screens", exact: true }).click();
  await expect(lane.locator(".cds-map-notes")).toContainText("2 kit screens stand for src/client/app/ProjectScreen.tsx");
  await expect(lane.locator(".cds-map-how")).toContainText("Never moves this way.");
  await expect(lane.locator(".cds-map-tally").first()).toHaveText("Compared with 1 App screen, never written");
  await lane.screenshot({ path: join(shots, "3.1-mapping-screens-lane.png"), animations: "disabled" });
});

/** A fixture world and server of its own, so a run here never changes what the shared suite sees */
async function ownWorld() {
  const fx = makeFixture();
  const app = createApp(fx.ctx, { fake: { designDir: fx.designNowDir } });
  const { server, url } = await new Promise<{ server: ReturnType<typeof serve>; url: string }>((resolve) => {
    const s = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" }, (info) => resolve({ server: s, url: `http://127.0.0.1:${info.port}` }));
  });
  return {
    fx,
    url,
    close: async () => {
      if ("closeAllConnections" in server) server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(dirname(fx.repo), { recursive: true, force: true });
    },
  };
}

test("a port from the kit is a draft: scanned for architecture, merged only after review (3.2)", async ({ page, request }) => {
  const world = await ownWorld();
  try {
    await page.goto(world.url);
    const hidden = row(page, "Recover hidden lists");
    await hidden.getByRole("radio", { name: "Into the App" }).first().click();
    await hidden.getByRole("button", { name: "Recover hidden lists", exact: true }).click();
    await expect(hidden.locator(".cds-proposal")).toContainText("Draft “Recover hidden lists” from the kit for your review");
    await hidden.getByRole("button", { name: "Run this feature only" }).click();
    await page.getByRole("button", { name: /^Run \d+ steps?$/ }).click();

    const panel = page.getByRole("complementary", { name: "Activity" });
    const review = panel.getByRole("region", { name: "Review the draft, then merge" });
    await expect(review).toBeVisible({ timeout: 30_000 });
    // the check passed, and the scan still found the whole-store read the port added
    const heading = review.getByRole("heading", { name: "The architecture scan flagged 1 thing in 1 file" });
    await expect(heading).toBeVisible();
    const findings = review.getByRole("list", { name: "Findings" });
    await expect(findings).toContainText("useKitStore() reads the whole store");
    await expect(findings.getByRole("button", { name: "Copy its diff" })).toBeVisible();
    await expect(review).toContainText("Base UI primitives still carry the behaviour");
    const mergeButton = review.getByRole("button", { name: /^Merge \d+ commits? into main$/ });
    await expect(mergeButton).toBeDisabled();
    // every other Merge opens the review instead of merging blind, and lands on it
    await expect(page.locator(".cds-bar").getByRole("button", { name: /^Review the draft/ })).toBeVisible();
    const banner = page.getByRole("region", { name: "“Recover hidden lists” is a draft waiting for your review" });
    await expect(banner).toBeVisible();
    await page.locator(".cds-panel").evaluate((el) => el.querySelector(".cds-panel-body, .cds-jobview")?.scrollTo?.(0, 0));
    await banner.getByRole("button", { name: "Review the draft" }).click();
    await expect(heading).toBeFocused();
    // nor can the API skip it
    const job = (await (await request.get(`${world.url}/api/state`)).json()).jobs[0] as { id: string };
    const refused = await request.post(`${world.url}/api/jobs/${job.id}/merge`, { headers: { "x-cds": "1", "content-type": "application/json" }, data: {} });
    expect(refused.status()).toBe(409);
    expect((await refused.json()).error).toContain("merges only after your review");
    mkdirSync(shots, { recursive: true });
    await panel.screenshot({ path: join(shots, "3.2-draft-review.png"), animations: "disabled" });
    await page.locator(".cds-merge-banner").screenshot({ path: join(shots, "3.2-draft-banner.png"), animations: "disabled" });

    const confirm = review.getByRole("checkbox", { name: "I reviewed this draft against these points" });
    await expect(confirm).toBeDisabled();
    await findings.getByRole("checkbox").check();
    await confirm.check();
    await expect(mergeButton).toBeEnabled();
    await mergeButton.click();
    await expect(panel.locator(".cds-jobview-head")).toContainText("done");
    const merged = (await (await request.get(`${world.url}/api/jobs/${job.id}`)).json()) as { app: { state: string; review: { reviewedAt?: string } } };
    expect(merged.app.state).toBe("merged");
    expect(merged.app.review.reviewedAt).toBeTruthy();
  } finally {
    await world.close();
  }
});

test("a brief names what to read instead of pasting truncated diffs (3.6, 5.4)", async ({ page }) => {
  await page.goto("/");
  const hidden = row(page, "Recover hidden lists");
  await hidden.getByRole("button", { name: "Recover hidden lists", exact: true }).click();
  const step = hidden.locator(".cds-step", { hasText: "Draft “Recover hidden lists” from the kit for your review" });
  await step.getByRole("button", { name: "Read brief" }).click();
  const brief = step.locator(".cds-brief");
  await expect(brief).toContainText("## Read the changes first");
  await expect(brief).toContainText("The kit's changes are not pasted here.");
  await expect(brief).toContainText(/`git diff --no-index \S+BoardView\.d\.ts \S+BoardView\.d\.ts` \(\+1 −0\), then read/);
  await expect(brief).toContainText("The App's current version (relative to the repository root), to change on top of: `src/client/design/board/BoardView.tsx`");
  await expect(brief).not.toContainText("truncated");
  await expect(brief).not.toContainText("omitted for length");
  mkdirSync(shots, { recursive: true });
  await brief.evaluate((el) => el.scrollTo(0, el.innerHTML.indexOf("Read the changes first") > 0 ? (el as HTMLElement).scrollHeight * 0.18 : 0));
  await step.screenshot({ path: join(shots, "3.6-brief.png"), animations: "disabled" });
});

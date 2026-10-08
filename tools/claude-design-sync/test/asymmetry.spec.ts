// The report's challenges 3.1–3.3/5.1–5.3 in the GUI: references stay references, drafts wait for review,
// and the kit side shows pictures, not only diffs. Screenshots land in .tmp/20261007_report_fixes.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

import { TOOL_DIR } from "../src/engine/config";
import { ownWorld } from "./world";

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

test("a port from the kit is a draft: scanned for architecture, merged only after review (3.2)", async ({ page, request }) => {
  const world = await ownWorld();
  try {
    await page.goto(world.url);
    const hidden = row(page, "Recover hidden lists");
    await hidden.getByRole("radio", { name: "Into the App" }).first().click();
    await hidden.getByRole("button", { name: "Recover hidden lists", exact: true }).click();
    await expect(hidden.locator(".cds-proposal")).toContainText("Draft the kit's changes to BoardView for your review");
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
  const step = hidden.locator(".cds-step", { hasText: "Draft the kit's changes to BoardView for your review" });
  await step.getByRole("button", { name: "Read brief" }).click();
  const brief = step.locator(".cds-brief");
  await expect(brief).toContainText("## Read the changes first");
  await expect(brief).toContainText("The kit's changes are not pasted here.");
  await expect(brief).toContainText(/git diff --no-index \S+BoardView\.d\.ts \S+BoardView\.d\.ts {3}# \+1 −0/);
  await expect(brief).toContainText("Change on top of the App's current files (relative to the repository root): `src/client/design/board/BoardView.tsx`, `src/client/design/board/BoardView.css`");
  await expect(brief).not.toContainText("truncated");
  await expect(brief).not.toContainText("omitted for length");
  mkdirSync(shots, { recursive: true });
  await brief.evaluate((el) => el.scrollTo(0, el.innerHTML.indexOf("Read the changes first") > 0 ? (el as HTMLElement).scrollHeight * 0.18 : 0));
  await step.screenshot({ path: join(shots, "3.6-brief.png"), animations: "disabled" });
});

test("a push drafts the kit's mechanical files from Storybook and keeps twins itself (3.3, 5.2)", async ({ page }) => {
  const world = await ownWorld();
  try {
    await page.goto(world.url);
    const hidden = row(page, "Recover hidden lists");
    await hidden.getByRole("radio", { name: "Into Design" }).first().click();
    await hidden.getByRole("button", { name: "Recover hidden lists", exact: true }).click();
    const push = hidden.locator(".cds-step", { hasText: "Port “Recover hidden lists” into the kit" });
    await push.getByRole("button", { name: "Read brief" }).click();
    await expect(push.locator(".cds-brief")).toContainText("## Drafted for you from Storybook");
    await hidden.getByRole("button", { name: "Run this feature only" }).click();
    await page.getByRole("button", { name: /^Run \d+ steps?$/ }).click();

    const panel = page.getByRole("complementary", { name: "Activity" });
    const upload = panel.getByRole("region", { name: "Upload to Claude Design" });
    await expect(upload).toBeVisible({ timeout: 30_000 });
    const file = (path: string) => upload.locator(".cds-files li", { hasText: path });
    await expect(upload.locator(".cds-files-sum")).toHaveText("5 files · 1 by Claude Code · 3 drafted from Storybook · 1 Minimal twin");
    for (const p of ["components/board/HiddenListsMenu.d.ts", "components/board/HiddenListsMenu.prompt.md", "components/board/hiddenlistsmenu.card.html"]) await expect(file(p)).toContainText("drafted from Storybook");
    await expect(file("components/board/hiddenlistsmenu-minimal.card.html")).toContainText("Minimal twin, written by the tool");
    // the fake AI never wrote HiddenListsMenu.jsx: its drafts wait unticked, saying why
    await expect(file("components/board/HiddenListsMenu.d.ts").getByRole("checkbox")).not.toBeChecked();
    await expect(file("components/board/HiddenListsMenu.d.ts")).toContainText("HiddenListsMenu.jsx wasn't written");
    await expect(file("components/board/BoardView.jsx").getByRole("checkbox")).toBeChecked();
    // the twin hangs under its card
    const order = await upload.locator(".cds-files .cds-path").allTextContents();
    expect(order.indexOf("components/board/hiddenlistsmenu-minimal.card.html")).toBe(order.indexOf("components/board/hiddenlistsmenu.card.html") + 1);
    await expect(panel.getByRole("list", { name: "Log" })).toContainText("Drafted components/board/HiddenListsMenu.d.ts from Storybook");
    await file("components/board/hiddenlistsmenu.card.html").getByRole("button", { name: "Preview" }).click();
    await expect(upload.locator("iframe")).toHaveAttribute("src", /hiddenlistsmenu\.card\.html$/);
    mkdirSync(shots, { recursive: true });
    await upload.screenshot({ path: join(shots, "3.3-drafted-kit-files.png"), animations: "disabled" });
  } finally {
    await world.close();
  }
});

test("a component is pictured on both sides, per theme, instead of only diffed (5.3)", async ({ page }) => {
  const world = await ownWorld();
  try {
    // the App's BoardView gets stories, so Storybook has something to render
    writeFileSync(join(world.fx.repo, "src/client/design/board/BoardView.stories.tsx"), "export const Default = {};\nexport const Dense = {};\n");
    await page.goto(world.url);
    const hidden = row(page, "Recover hidden lists");
    await hidden.getByRole("button", { name: "Recover hidden lists", exact: true }).click();
    const unit = hidden.locator(".cds-unit", { hasText: "BoardView" });
    await unit.getByRole("button", { name: "Compare visually" }).click();
    const visual = unit.getByRole("region", { name: "BoardView on both sides" });
    await expect(visual).toBeVisible({ timeout: 60_000 });
    // Minimal first: the App's stories at theme:minimal beside the card's Minimal twin
    await expect(visual.getByRole("img", { name: "App story: Default, Minimal theme" })).toBeVisible();
    await expect(visual.getByRole("img", { name: "Kit card: Board, Minimal theme" })).toBeVisible();
    for (const img of await visual.getByRole("img").all()) expect(await img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
    mkdirSync(shots, { recursive: true });
    // the plan bar stays out of the picture
    await page.addStyleTag({ content: ".cds-plan{display:none}" });
    await visual.screenshot({ path: join(shots, "5.3-visual-minimal.png"), animations: "disabled" });
    await visual.getByRole("button", { name: "Rounded" }).click();
    await expect(visual.getByRole("img", { name: "Kit card: Board, Rounded theme" })).toBeVisible();
    await expect(visual.getByRole("img", { name: "App story: Dense, Rounded theme" })).toBeVisible();
    await visual.screenshot({ path: join(shots, "5.3-visual-rounded.png"), animations: "disabled" });
    // a second look is served from the cache
    await unit.getByRole("button", { name: "Hide pictures" }).click();
    const t = Date.now();
    await unit.getByRole("button", { name: "Compare visually" }).click();
    await expect(visual.getByRole("img").first()).toBeVisible();
    expect(Date.now() - t).toBeLessThan(3000);
  } finally {
    await world.close();
  }
});

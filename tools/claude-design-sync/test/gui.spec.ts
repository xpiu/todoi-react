import { AxeBuilder } from "@axe-core/playwright";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const row = (page: Page, title: string) => page.locator(".cds-row", { has: page.getByRole("button", { name: title, exact: true }) });
const fresh = async (page: Page) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("cds-init")) {
      localStorage.clear();
      sessionStorage.setItem("cds-init", "1");
    }
  });
  await page.goto("/");
  await expect(page.locator(".cds-row-title").first()).toBeVisible();
};

test.describe.serial("Claude Design Sync", () => {
  test("shows what moved on which side, as features", async ({ page }) => {
    await fresh(page);
    await expect(page.getByRole("heading", { level: 2 }).first()).toContainText("Since Start");
    await expect(page.locator(".cds-row-title")).toContainText(["Recover hidden lists", "Chips"]);
    const hidden = row(page, "Recover hidden lists");
    await expect(hidden.locator(".cds-status")).toHaveText("changed on both");
    await expect(hidden.locator(".cds-cell-app")).toContainText("HiddenListsMenu");
    await expect(hidden.locator(".cds-cell-design")).toContainText("BoardView");
    await expect(row(page, "Chips").locator(".cds-status")).toHaveText("new in Design");
  });

  test("offers the three directions globally and per feature", async ({ page }) => {
    await fresh(page);
    const chips = row(page, "Chips");
    const toast = row(page, "Retryable toast");
    await page.locator(".cds-global").getByRole("radio", { name: /Into Design/ }).click();
    // Chips only changed in Design, so pushing it is unavailable and it falls back to Skip
    await expect(chips.getByRole("radio", { name: "Skip" })).toHaveAttribute("aria-checked", "true");
    await expect(chips.getByRole("radio", { name: "Into Design" })).toHaveAttribute("aria-disabled", "true");
    await expect(toast.getByRole("radio", { name: "Into Design" })).toHaveAttribute("aria-checked", "true");
    await expect(page.locator(".cds-plan-sum strong")).toContainText("into Design");

    await page.locator(".cds-global").getByRole("radio", { name: /Into the App/ }).click();
    await expect(chips.getByRole("radio", { name: "Into the App" })).toHaveAttribute("aria-checked", "true");
    // the toast commit also touched the token file, which Design changed too, so it can be pulled
    await expect(toast.getByRole("radio", { name: "Into the App" })).toHaveAttribute("aria-checked", "true");

    // one feature overridden on its rail, then reset
    await chips.getByRole("radio", { name: "Full sync" }).click();
    await expect(chips.getByRole("radio", { name: "Full sync" })).toHaveAttribute("aria-checked", "true");
    await expect(chips.getByRole("button", { name: /reset/ })).toBeVisible();
    await chips.getByRole("button", { name: /reset/ }).click();
    await expect(chips.getByRole("radio", { name: "Into the App" })).toHaveAttribute("aria-checked", "true");

    // arrow keys move along the rail, skipping unavailable keys
    await chips.getByRole("radio", { name: "Into the App" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(chips.getByRole("radio", { name: "Full sync" })).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("ArrowRight");
    await expect(chips.getByRole("radio", { name: "Skip" })).toHaveAttribute("aria-checked", "true");
    await page.locator(".cds-global").getByRole("radio", { name: /Full sync/ }).click();
  });

  test("sets a direction per subfeature, inside an opened feature", async ({ page }) => {
    await fresh(page);
    await page.getByRole("button", { name: "Recover hidden lists", exact: true }).click();
    const hidden = row(page, "Recover hidden lists");
    const board = hidden.getByRole("radiogroup", { name: "Direction for BoardView" });
    const menu = hidden.getByRole("radiogroup", { name: "Direction for HiddenListsMenu" });
    await expect(board.getByRole("radio", { name: "Full sync" })).toHaveAttribute("aria-checked", "true");
    // HiddenListsMenu is new in the App: nothing to pull, so it follows "both" as far as it can
    await expect(menu.getByRole("radio", { name: "Into the App" })).toHaveAttribute("aria-disabled", "true");
    await menu.getByRole("radio", { name: "Skip" }).click();
    await expect(menu.getByRole("radio", { name: "Skip" })).toHaveAttribute("aria-checked", "true");
    await expect(hidden.locator(".cds-unit", { has: page.getByRole("radiogroup", { name: "Direction for HiddenListsMenu" }) }).getByRole("button", { name: /reset/ })).toBeVisible();
    // the feature's push step now carries only BoardView
    await expect(hidden.locator(".cds-step").first()).toBeVisible();
    await page.getByRole("button", { name: /Clear \d+ override/ }).click();
    await expect(menu.getByRole("radio", { name: "Full sync" })).toHaveAttribute("aria-checked", "true");
  });

  test("opens a feature: evidence, diffs and the steps with briefs", async ({ page }) => {
    await fresh(page);
    await page.getByRole("button", { name: "Recover hidden lists", exact: true }).click();
    const hidden = row(page, "Recover hidden lists");
    await hidden.getByRole("button", { name: "App diff" }).first().click();
    await expect(hidden.locator(".cds-diff")).toContainText("after?: unknown");
    await expect(hidden.locator(".cds-step").first()).toBeVisible();
    await hidden.getByRole("button", { name: "Read brief" }).first().click();
    await expect(hidden.locator(".cds-brief").first()).toContainText("Recover hidden lists");
  });

  test("has no serious accessibility violations and fits a phone", async ({ page }) => {
    await fresh(page);
    const axe = await new AxeBuilder({ page }).analyze();
    const serious = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(".cds-row-title").first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("runs the plan, stops for merge and upload approval, does both, and marks a sync point", async ({ page }) => {
    await fresh(page);
    await page.getByRole("button", { name: /Run plan/ }).click();
    await expect(page.getByRole("heading", { name: /Run \d+ steps\?/ })).toBeVisible();
    await page.getByRole("button", { name: /^Run \d+ steps$/ }).click();
    const panel = page.getByRole("complementary", { name: "Activity" });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("heading", { name: "Upload to Claude Design" })).toBeVisible({ timeout: 30_000 });
    // App work waits on its own verified branch; the fixture's checkout hasn't moved
    const repo = join(tmpdir(), "cds-e2e", "repo");
    const headBefore = execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const merge = panel.getByRole("region", { name: "Merge into the App" });
    await expect(merge).toContainText("design-sync/run-");
    await expect(merge.getByRole("list", { name: "Commits to merge" })).toContainText("(fake)");
    await expect(panel.locator(".cds-jobsteps")).toContainText("passed");
    // Merge is offered wherever the eye lands while the branch waits: the navbar, a banner, the plan bar
    const mergeName = /^Merge \d+ commits? into main$/;
    const barMerge = page.locator(".cds-bar").getByRole("button", { name: mergeName });
    const banner = page.getByRole("region", { name: /waits for your merge/ });
    await expect(barMerge).toBeEnabled();
    await expect(banner.getByRole("button", { name: mergeName })).toBeEnabled();
    await expect(banner.getByRole("list", { name: "Commits to merge" })).toContainText("(fake)");
    await expect(page.getByRole("region", { name: "Sync plan" }).getByRole("button", { name: mergeName })).toBeEnabled();
    // the panel already shows this run's own merge block, so it pins no reminder strip
    await expect(panel.getByRole("group", { name: "Waiting for your merge" })).toHaveCount(0);
    const files = panel.locator(".cds-files li");
    expect(await files.count()).toBeGreaterThan(0);
    await expect(panel.locator(".cds-files")).toContainText("tokens/themes/minimal-components.css");
    // Design rewrites a staged file meanwhile: the upload stops instead of overwriting it
    const paths = await panel.locator(".cds-files .cds-path").allTextContents();
    const other = paths.find((p) => !p.endsWith(".css"))!;
    const otherLive = join(tmpdir(), "cds-e2e", "design-now", other);
    writeFileSync(otherLive, "// rewritten in Claude Design\n");
    await panel.getByRole("button", { name: /Upload \d+ files?/ }).click();
    await expect(panel.locator(".cds-file-note")).toContainText("Claude Design");
    await expect(panel.locator(".cds-jobview-head")).toContainText("waiting for your approval");
    await expect(panel.getByRole("checkbox", { name: other })).not.toBeChecked();
    expect(readFileSync(otherLive, "utf8")).toBe("// rewritten in Claude Design\n");
    // Discard asks first; keeping the run changes nothing
    await panel.getByRole("button", { name: "Discard run…" }).click();
    await expect(panel.getByRole("group", { name: "Discard this run" })).toContainText("nothing goes to Claude Design");
    await expect(panel.getByRole("group", { name: "Discard this run" })).toContainText("nothing reaches main");
    await panel.getByRole("button", { name: "Keep" }).click();
    await panel.getByRole("button", { name: /Upload \d+ files?/ }).click();
    // uploaded, but the App branch still waits for its merge
    await expect(panel.locator(".cds-jobview")).toContainText("all read back intact", { timeout: 30_000 });
    await expect(panel.locator(".cds-jobview-head")).toContainText("waiting for your approval");
    expect(execFileSync("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim()).toBe(headBefore);
    await merge.getByRole("button", { name: /Merge \d+ commits? into main/ }).click();
    await expect(panel.locator(".cds-jobview-head")).toContainText("done");
    // merged: every offer is gone
    await expect(barMerge).toHaveCount(0);
    await expect(banner).toHaveCount(0);
    await expect(page.locator(".cds-bar").getByRole("button", { name: /Merge/ })).toHaveCount(0);
    expect(execFileSync("git", ["-C", repo, "log", "--format=%s", `${headBefore}..HEAD`], { encoding: "utf8" })).toContain("(fake)");
    expect(execFileSync("git", ["-C", repo, "branch", "--list", "design-sync/run-*"], { encoding: "utf8" }).trim()).toBe("");
    // the uploaded run's staging copy is gone
    const stages = join(tmpdir(), "cds-e2e", "state", "stage");
    expect(existsSync(stages) ? readdirSync(stages) : []).toEqual([]);
    // the fake Design project received the merged tokens
    const fakeDesign = join(tmpdir(), "cds-e2e", "design-now", "tokens/themes/minimal-components.css");
    expect(existsSync(fakeDesign) && readFileSync(fakeDesign, "utf8")).toContain(".td-hidden");

    await page.getByRole("button", { name: "Close activity" }).click();
    await page.getByRole("button", { name: /Mark synced/ }).click();
    await page.getByLabel("Label").fill("After the e2e run");
    await page.getByRole("checkbox", { name: /git tag/ }).uncheck();
    // everything ran, so every feature starts ticked; Chips is left open on purpose
    const synced = page.getByRole("group", { name: "Synced this round" });
    await expect(synced.getByRole("checkbox", { name: /Chips/ })).toBeChecked();
    await synced.getByRole("checkbox", { name: /Chips/ }).uncheck();
    await expect(page.locator(".cds-mark")).toContainText("1 feature stays open");
    await page.getByRole("button", { name: "Record sync point" }).click();
    await expect(page.locator(".cds-verdict-line")).toContainText("Since After the e2e run");
    // the kept-open feature is still compared, from where it was
    await expect(row(page, "Chips").locator(".cds-cell-design")).toContainText("Kept open since Start");
  });

  test("names the target Claude Design project in the footer, and switches it", async ({ page }) => {
    await fresh(page);
    const foot = page.getByRole("contentinfo");
    await expect(foot).toContainText("Todoi Design System");
    await expect(foot.getByRole("link", { name: /claude\.ai\/design\/p\/fake/ })).toHaveAttribute("href", "https://claude.ai/design/p/fake");
    await expect(page.getByRole("link", { name: /in Claude Design/ })).toHaveAttribute("href", "https://claude.ai/design/p/fake");

    await foot.getByRole("button", { name: "Edit" }).click();
    const field = foot.getByLabel("Project link or id");
    await expect(field).toHaveValue("https://claude.ai/design/p/fake");
    await field.fill("https://claude.ai/design");
    await foot.getByRole("button", { name: "Use this project" }).click();
    await expect(foot.locator(".cds-error-inline")).toContainText("Paste a Claude Design project link");
    await field.fill("missing-project");
    await foot.getByRole("button", { name: "Use this project" }).click();
    await expect(foot.locator(".cds-error-inline")).toContainText("no project missing-project");

    await field.fill("https://claude.ai/design/p/fake-2");
    await foot.getByRole("button", { name: "Use this project" }).click();
    await expect(foot).toContainText("Other Design System");
    await expect(foot.getByRole("link", { name: /fake-2/ })).toHaveAttribute("href", "https://claude.ai/design/p/fake-2");
    const config = JSON.parse(readFileSync(join(tmpdir(), "cds-e2e", "config.json"), "utf8")) as { design: { projectId: string; projectName: string } };
    expect(config.design).toMatchObject({ projectId: "fake-2", projectName: "Other Design System" });

    // and back, so the fixture targets its own project again
    await foot.getByRole("button", { name: "Edit" }).click();
    await foot.getByLabel("Project link or id").fill("fake");
    await foot.getByRole("button", { name: "Use this project" }).click();
    await expect(foot).toContainText("Fake Design System");
  });

  test("checks Claude Design for changes, pulls, and then reads up to date", async ({ page }) => {
    await fresh(page);
    const head = page.locator(".cds-head-actions");
    await head.getByRole("button", { name: "Check for changes" }).click();
    await expect(head.getByRole("button", { name: "Design changed — pull" })).toBeVisible();
    await head.getByRole("button", { name: "Pull now" }).click();
    const panel = page.getByRole("complementary", { name: "Activity" });
    await expect(panel.locator(".cds-jobview")).toContainText("Snapshot ready", { timeout: 30_000 });
    await expect(head.getByRole("button", { name: "Check for changes" })).toBeVisible();
    await head.getByRole("button", { name: "Check for changes" }).click();
    await expect(head.getByRole("button", { name: "Up to date" })).toBeVisible();
  });

  test("maps both sides lane by lane, replays recent moves, and brings its data up to date", async ({ page }) => {
    await fresh(page);
    await page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "Mapping" }).click();
    await expect(page).toHaveURL(/\/mapping$/);
    await expect(page.getByRole("link", { name: "Mapping" })).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".cds-map-top h2")).toContainText(/pair up as \d+ units/);
    const meta = page.locator(".cds-map-meta");
    await expect(meta).toContainText("Fake Design System");
    await expect(meta).toContainText("todoi-react");
    await expect(meta).toContainText("Sync point");
    await expect(page.locator(".cds-map-technique li")).toHaveCount(6);

    // each lane names its technique on the rail; opening one shows its rules and units
    const lane = (title: string) => page.locator(".cds-map-lane", { has: page.getByRole("button", { name: title, exact: true }) });
    await expect(lane("Tokens").locator(".cds-map-tech")).toHaveText("CSS merge");
    await expect(lane("Preview cards").locator(".cds-map-tech")).toHaveText("Reference only");
    await lane("Components").locator(".cds-map-tech").click();
    const comp = lane("Components");
    await expect(comp.locator(".cds-map-detail")).toContainText("Paired by");
    await expect(comp.locator(".cds-map-detail")).toContainText("AI port into a worktree");
    await comp.getByRole("button", { name: /^All/ }).click();
    await expect(comp.locator(".cds-map-units")).toContainText("BoardView");

    // the run earlier in this suite merged into the App, uploaded to Design, and marked a sync point
    const events = page.locator(".cds-map-event");
    await expect(events.filter({ hasText: "Merged into main" })).toHaveCount(1);
    await expect(events.filter({ hasText: "Marked synced" }).first()).toBeVisible();
    const upload = events.filter({ hasText: "Uploaded to Claude Design" }).first();
    await upload.getByRole("button", { name: "Show on the diagram" }).click();
    await expect(page.locator(".cds-map-legend")).toContainText("Uploaded to Claude Design");
    await expect(page.locator(".cds-map-lane[data-dim]").first()).toBeVisible();
    await expect(page.locator('.cds-map-track.is-out[data-motion="once"] .cds-map-seg[data-on]').first()).toBeVisible();
    await page.getByRole("button", { name: "Replay" }).click();
    await page.getByLabel("What the diagram shows").selectOption("waiting");
    await expect(page.locator(".cds-map-lane[data-dim]")).toHaveCount(0);

    // the refresh asks Claude Design, pulls when it's behind, and recompares
    await page.getByRole("button", { name: "Bring the mapping up to date" }).click();
    await expect(page.getByRole("status")).toHaveText("Both sides are current.", { timeout: 30_000 });
    await expect(meta.locator('.cds-map-fresh[data-ok="true"]')).toHaveCount(2);

    const axe = await new AxeBuilder({ page }).analyze();
    expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    // a move's log opens in the plan's Activity panel
    await events.filter({ hasText: "Merged into main" }).getByRole("link", { name: "Log" }).click();
    await expect(page.getByRole("complementary", { name: "Activity" })).toBeVisible();
  });
});

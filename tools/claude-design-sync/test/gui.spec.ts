import { AxeBuilder } from "@axe-core/playwright";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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

  test("runs the plan, stops for upload approval, uploads, and marks a sync point", async ({ page }) => {
    await fresh(page);
    await page.getByRole("button", { name: /Run plan/ }).click();
    await expect(page.getByRole("heading", { name: /Run \d+ steps\?/ })).toBeVisible();
    await page.getByRole("button", { name: /^Run \d+ steps$/ }).click();
    const panel = page.getByRole("complementary", { name: "Activity" });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("heading", { name: "Upload to Claude Design" })).toBeVisible({ timeout: 30_000 });
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
    await panel.getByRole("button", { name: /Upload \d+ files?/ }).click();
    await expect(panel.locator(".cds-jobview-head")).toContainText("done", { timeout: 30_000 });
    // the fake Design project received the merged tokens
    const fakeDesign = join(tmpdir(), "cds-e2e", "design-now", "tokens/themes/minimal-components.css");
    expect(existsSync(fakeDesign) && readFileSync(fakeDesign, "utf8")).toContain(".td-hidden");

    await page.getByRole("button", { name: "Close activity" }).click();
    await page.getByRole("button", { name: /Mark synced/ }).click();
    await page.getByLabel("Label").fill("After the e2e run");
    await page.getByRole("checkbox").uncheck();
    await page.getByRole("button", { name: "Record sync point" }).click();
    await expect(page.getByLabel("Compare since sync point")).toContainText("After the e2e run");
  });
});

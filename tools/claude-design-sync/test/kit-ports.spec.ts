// Lighter kit ports, chosen in the run review: a component whose stories alone changed is left out without an
// AI port, and the remaining ports share one Claude Code session. Its own world, so the shared suite never
// sees the run.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

import { git } from "../src/engine/git";
import type { Job } from "../src/server/jobs";
import { ownWorld } from "./world";

test("the run review leaves story-only parts out and ports the rest in one session", async ({ page, request }) => {
  const world = await ownWorld();
  try {
    // new examples for a component neither side otherwise changed
    writeFileSync(join(world.fx.repo, "src/client/design/core/Badge.stories.tsx"), "export const Large = { args: { n: 99 } };\n");
    git(world.fx.repo, ["add", "."]);
    git(world.fx.repo, ["commit", "-qm", "docs: badge examples"]);

    await page.goto(world.url);
    await expect(page.locator(".cds-row-title").first()).toBeVisible();
    await page.locator(".cds-global-opt", { hasText: "Into Design" }).click();
    await page.getByRole("button", { name: "Review selected sync steps" }).click();
    const review = page.getByRole("group", { name: /^Run \d+ steps? for/ });
    const lighter = review.getByRole("group", { name: "Lighter kit ports" });
    await expect(lighter).toContainText("1 part changed only its stories or docs");
    const portCount = async () => Number(/Runs Claude Code (\d+) times/.exec((await review.locator("ul").last().textContent()) ?? "")?.[1]);
    const before = await portCount();

    await lighter.getByRole("checkbox", { name: /Leave Storybook-only changes out of the kit/ }).check();
    await expect(review).toContainText("Leaves 1 part out of the kit without an AI port");
    // Badge's own port is gone; the others remain
    await expect.poll(portCount).toBe(before - 1);
    const ports = before - 1;
    expect(ports).toBeGreaterThan(1);
    await lighter.getByRole("combobox").selectOption({ label: `All ${ports} features in one` });
    await expect(review).toContainText(`Runs Claude Code 1 time to port App work into a staging copy of the kit, ${ports} features grouped by area`);

    await review.getByRole("button", { name: /^Run \d+ steps?$/ }).click();
    const panel = page.getByRole("complementary", { name: "Activity" });
    await expect(panel.getByRole("heading", { name: "Upload to Claude Design" })).toBeVisible({ timeout: 30_000 });
    const id = new URL(page.url()).searchParams.get("job") ?? (await (await request.get(`${world.url}/api/state`)).json() as { jobs: Job[] }).jobs[0]!.id;
    const job = (await (await request.get(`${world.url}/api/jobs/${id}`)).json()) as Job;
    expect(job.steps.filter((s) => s.kind === "ai-push")).toHaveLength(1);
    expect(job.steps.find((s) => s.kind === "ai-push")!.title).toMatch(new RegExp(`^Port ${ports} features into the kit in one session`));
    expect(job.steps.find((s) => s.kind === "leave-examples")?.state).toBe("done");
    // the left-out part is covered by the run, so the upload records it synced with the rest
    expect(job.covers).toContain("component:core/Badge");
    // the choices are remembered for the next run
    expect(await page.evaluate(() => localStorage.getItem("cds-kit-ports"))).toBe(JSON.stringify({ leaveExamples: true, batch: 100 }));
  } finally {
    await world.close();
  }
});

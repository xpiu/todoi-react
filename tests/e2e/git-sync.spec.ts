// Git sync in the browser, against the fake GitHub (tests/fakes/fakeGithub.ts on :3199; the dev API must
// run with GITHUB_API_URL=http://127.0.0.1:3199): connect a project and store it as a new file, a push to
// GitHub arriving by webhook, a real conflict resolved in the dialog, undo, and disconnect.
import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";

import { freshProject, signIn, useScope, type Scope } from "./helpers";

const FAKE = process.env.FAKE_GITHUB_URL ?? "http://127.0.0.1:3199";
const fake = async (route: string, body: unknown) => {
  const res = await fetch(`${FAKE}/_fake/${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`fake ${route}: ${res.status}`);
  return res.json();
};
const fakeFile = async (repo: string, path: string) => (await (await fetch(`${FAKE}/_fake/file?repo=${repo}&branch=main&path=${encodeURIComponent(path)}`)).json()) as { text: string } | null;

let fakeRunning = false;
test.beforeAll(async () => {
  fakeRunning = await fetch(`${FAKE}/_fake/file?repo=x&branch=x&path=x`).then((r) => r.ok, () => false);
});

/** Let a dialog finish opening (its fade) before a screenshot. */
const settle = (page: Page) => page.waitForTimeout(350);
const gitOf = async (page: Page, projectId: string) => ((await (await page.request.get(`/api/projects/${projectId}/git`)).json()) as { connection: { state: string; runs: Array<{ trigger: string; outcome: string; pulled: number }> } }).connection;
const group = (page: Page, title: string) => page.locator(".td-settings-group").filter({ has: page.getByRole("heading", { name: title, exact: true }) });

for (const scope of ["rounded-light", "minimal-dark"] as Scope[]) {
  test(`connects, syncs both ways, resolves a conflict, undoes and disconnects in ${scope}`, async ({ page }) => {
    test.skip(!fakeRunning, "the fake GitHub isn't running on :3199 (npx tsx tests/fakes/fakeGithub.ts 3199)");
    test.setTimeout(90_000);
    await useScope(page, scope);
    await signIn(page);
    const repo = `acme/plans-${scope}`;
    const token = `github_pat_e2e_${scope.replace("-", "_")}_0000000000`;
    await fake("token", { token, login: "flo", repos: [repo], push: true });
    await fake("repo", { fullName: repo });
    const project = await freshProject(page, "Git sync", { lists: [["To-do", "TODO"], ["Done", "DONE"]] });
    try {
      const review = await project.item("Review the copy", { priority: "HIGH" });
      await project.item("Book the venue");
      await page.goto("/settings?s=storage");
      await expect(page.getByRole("heading", { level: 2, name: "Synchronization" })).toBeVisible();
      await expect(group(page, "Not synced").locator(".td-settings-row").filter({ hasText: project.name })).toContainText("Only in Todoi");

      // Connect: check the repository, then store the project as a new file.
      await page.locator(".td-settings-row").filter({ hasText: project.name }).getByRole("button", { name: "Connect" }).click();
      const dialog = page.getByRole("dialog", { name: "Connect a repository" });
      await dialog.getByLabel("Repository").fill(`github.com/${repo}`);
      await dialog.getByLabel("GitHub token").fill(token);
      await settle(page);
      await page.screenshot({ path: `.tmp/shots/git-connect-form-${scope}.png` });
      await dialog.getByRole("button", { name: "Check repository" }).click();
      const ready = page.getByRole("dialog", { name: "Ready to connect" });
      await expect(ready.getByText(`${repo} · main`)).toBeVisible();
      const path = await ready.getByText(/^No todo\/.*\.md yet$/).textContent();
      await settle(page);
      await page.screenshot({ path: `.tmp/shots/git-connect-checked-${scope}.png` });
      await ready.getByRole("button", { name: "Store new file" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Stored" })).toContainText(`Stored “${project.name}” in ${repo}`);
      const file = path!.replace(/^No | yet$/g, "");
      expect((await fakeFile(repo, file))?.text).toContain("- [ ] Review the copy\nstatus: todo, prio: high");
      // One card per connected project, titled by the project alone.
      const panel = group(page, project.name);
      const repoRow = panel.locator(".td-settings-row").first();
      await expect(repoRow.locator(".td-settings-rowlabel")).toHaveText("Repository");
      await expect(repoRow).toContainText(repo);
      await expect(panel.getByRole("button", { name: "Sync now" })).toBeVisible();

      // Pushes to GitHub sync on their own: the fake delivers a signed webhook to the dev API.
      await expect(panel.getByText("Syncs after each push and every 10 minutes", { exact: false })).toBeVisible();
      const md = (await fakeFile(repo, file))!.text;
      await fake("push", { fullName: repo, branch: "main", path: file, text: md.replace("- [ ] Book the venue", "- [x] Book the venue").replace("# Done\n", "# Done\n- [ ] Send the invites\n") });
      await expect.poll(async () => (await gitOf(page, project.projectId)).runs.find((r) => r.trigger === "webhook"), { timeout: 15_000 }).toMatchObject({ outcome: "pulled", pulled: 2 });
      const items = (await (await page.request.get(`/api/items?projectId=${project.projectId}`)).json()) as Array<{ title: string; done: boolean }>;
      expect(items.find((i) => i.title === "Book the venue")?.done).toBe(true);
      expect(items.find((i) => i.title === "Send the invites")?.done).toBe(false);

      // Both sides change the same title: the push's sync pauses; the dialog shows the versions.
      expect((await page.request.patch(`/api/items/${review}`, { data: { title: "Review the copy (Todoi)" } })).ok()).toBeTruthy();
      const now = (await fakeFile(repo, file))!.text;
      await fake("push", { fullName: repo, branch: "main", path: file, text: now.replace("- [ ] Review the copy", "- [ ] Review the copy (file)") });
      await expect.poll(async () => (await gitOf(page, project.projectId)).state, { timeout: 15_000 }).toBe("conflict");
      await page.reload();
      await expect(panel.locator(".td-git-state").filter({ hasText: "Paused · 1 thing changed in both places" })).toBeVisible();
      await expect(panel.getByRole("button", { name: "Sync now" })).toHaveCount(0);
      await panel.getByRole("button", { name: "Resolve conflict" }).click();
      const conflict = page.getByRole("dialog", { name: "Resolve GitHub sync conflict" });
      await expect(conflict.getByText("Title changed in Todoi and in the file")).toBeVisible();
      await expect(conflict.getByRole("button", { name: "Apply and sync" })).toBeDisabled();
      await conflict.getByRole("button", { name: /Keep the file's/ }).click();
      await settle(page);
      await page.screenshot({ path: `.tmp/shots/git-conflict-${scope}.png` });
      await conflict.getByRole("button", { name: "Apply and sync" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Conflict resolved" })).toBeVisible();
      expect(((await (await page.request.get(`/api/items/${review}`)).json()) as { title: string }).title).toBe("Review the copy (file)");

      // The history lists every run; Undo puts Todoi back as it was before the last sync that changed it.
      // The recent syncs are rows of the same card, right after the state row.
      const newestRun = panel.locator(".td-settings-row").nth(2);
      await expect(newestRun).toContainText("Brought in 1 change from the file");
      await settle(page);
      await page.screenshot({ path: `.tmp/shots/git-panel-${scope}.png` });
      await panel.getByRole("button", { name: "Undo" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Undid the last sync" })).toBeVisible();
      await expect(newestRun).toContainText(/^Undid a sync and wrote \d+ changes? back to the file/);
      expect(((await (await page.request.get(`/api/items/${review}`)).json()) as { title: string }).title).toBe("Review the copy (Todoi)");
      expect((await fakeFile(repo, file))!.text).toContain("- [ ] Review the copy (Todoi)");

      // A schedule keeps it in sync; one that stalls reads "Sync overdue".
      const schedule = panel.getByRole("switch", { name: "Sync on a schedule" });
      await expect(schedule).toHaveAttribute("aria-checked", "true");
      await schedule.click();
      await expect.poll(async () => ((await (await page.request.get(`/api/projects/${project.projectId}/git`)).json()) as { connection: { autoSync: boolean } }).connection.autoSync).toBe(false);
      await schedule.click();
      await expect(schedule).toHaveAttribute("aria-checked", "true");
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      await pool.query("update git_connections set last_synced_at = now() - interval '2 hours' where project_id = $1", [project.projectId]);
      await pool.end();
      await page.reload();
      await expect(panel.getByText("Sync overdue", { exact: true })).toBeVisible();
      await expect(panel.getByText("instead of every 10 minutes. Press Sync now to see why", { exact: false })).toBeVisible();
      await page.screenshot({ path: `.tmp/shots/git-behind-${scope}.png` });

      // Disconnect: the file stays, the panel goes.
      await panel.getByRole("button", { name: "Disconnect" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Disconnect" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Disconnected" })).toBeVisible();
      await expect(panel).toHaveCount(0);
      expect(await fakeFile(repo, file)).not.toBeNull();
    } finally {
      await project.cleanup();
    }
  });
}

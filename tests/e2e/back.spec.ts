// Back in the top bar (DESIGN.md › TopNavbar): the pages outside a project lead their title with a chevron that returns
// to the tab's last project in the view it was left in, else the first project in sidebar order.
import { expect, test as base } from "@playwright/test";

import { checkA11y, freshProject, signIn, type FreshProject } from "./helpers";

const test = base.extend<{ project: FreshProject }>({
  project: async ({ page }, use) => {
    await signIn(page);
    const project = await freshProject(page, "Back target");
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await use(project);
    } finally {
      await project.cleanup();
      expect(errors, "unexpected browser exceptions").toEqual([]);
    }
  },
});

const PAGES = [
  ["/settings", "Settings"],
  ["/account", "Account"],
  ["/inbox", "Inbox"],
  ["/projects", "Projects"],
  ["/groups", "Project groups"],
] as const;

test("every page outside a project returns to the last project in its last view", async ({ page, project }) => {
  await page.goto(`/p/${project.projectId}?v=board`);
  await expect(page.getByRole("button", { name: `Rename project: ${project.name}` })).toBeVisible();
  // A project title has no Back
  await expect(page.locator("button.td-topnav-back")).toHaveCount(0);
  for (const [path, title] of PAGES) {
    await page.goto(path);
    const back = page.getByRole("button", { name: `Back to ${project.name}`, exact: true });
    await expect(back).toBeVisible();
    await expect(page.locator(".td-topnav-title[data-back]")).toContainText(title);
    await back.click();
    await expect(page).toHaveURL(new RegExp(`/p/${project.projectId}\\?v=board$`));
    // Back leaves with its button: focus lands on the project title's rename trigger
    await expect(page.getByRole("button", { name: `Rename project: ${project.name}` })).toBeFocused();
  }
});

test("Back works from the keyboard and passes the accessibility check", async ({ page, project }) => {
  await page.goto(`/p/${project.projectId}`);
  await expect(page.getByRole("button", { name: `Rename project: ${project.name}` })).toBeVisible();
  await page.goto("/settings");
  const back = page.getByRole("button", { name: `Back to ${project.name}`, exact: true });
  await expect(back).toBeVisible();
  await checkA11y(page, "settings with Back");
  await back.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/p/${project.projectId}$`));
});

test("without a usable last project Back goes to the first project in sidebar order", async ({ page, project }) => {
  void project;
  await page.goto("/settings");
  // A last project that no longer exists falls back the same way as none
  await page.evaluate(() => {
    sessionStorage.setItem("td-last-project", "00000000-0000-0000-0000-000000000000");
    sessionStorage.setItem("td-last-project-view", JSON.stringify({ v: "calendar" }));
  });
  await page.reload();
  const first = page.locator(".td-sidebar [data-sb-kind=\"project\"]").first();
  const back = page.locator("button.td-topnav-back");
  await expect(back).toBeVisible();
  const label = (await back.getAttribute("aria-label")) ?? "";
  expect(label).toMatch(/^Back to (?!Projects$)./);
  await back.click();
  await expect(page).toHaveURL(/\/p\/[^?]+$/);
  if (await first.count()) await expect(page).toHaveURL(new RegExp(`/p/${await first.getAttribute("data-sb-id")}$`));
});

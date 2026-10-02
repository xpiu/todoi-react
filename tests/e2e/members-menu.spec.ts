import { expect, test as base } from "@playwright/test";

import type { ProjectDetail } from "../../src/client/data/api";
import { checkA11y, freshProject, seedProjectId, signIn } from "./helpers";

// The Members dropdown (DESIGN.md › Subnavbar): the roster with role pickers, Invite people, Visibility
// and the project link, on a fresh project where Sam is an editor. Changes land without closing it.
type Fixture = { projectId: string; sam: { id: string; name: string } };
const test = base.extend<{ fixture: Fixture }>({
  fixture: async ({ page }, use) => {
    await signIn(page);
    const seed = (await (await page.request.get(`/api/projects/${await seedProjectId(page)}`)).json()) as ProjectDetail;
    const sam = seed.members.find((m) => m.role !== "owner")!;
    const f = await freshProject(page, "Members");
    try {
      expect((await page.request.put(`/api/projects/${f.projectId}/members/${sam.userId}`, { data: { role: "editor" } })).ok()).toBeTruthy();
      await use({ projectId: f.projectId, sam: { id: sam.userId, name: sam.name } });
    } finally {
      await f.cleanup();
    }
  },
});

const detail = async (page: import("@playwright/test").Page, id: string) => (await (await page.request.get(`/api/projects/${id}`)).json()) as ProjectDetail;

test("the Members dropdown changes a role and the visibility in place, and Invite opens the settings", async ({ page, fixture: f }) => {
  await page.goto(`/p/${f.projectId}?v=list`);
  await page.getByRole("toolbar", { name: "Project views and actions" }).locator('button[data-tip="Members"]').click();
  const menu = page.getByRole("dialog", { name: "Project members and sharing" });
  const roster = menu.getByRole("list", { name: "Members" });
  await expect(roster.getByRole("listitem")).toHaveCount(2);
  await expect(roster.getByRole("listitem").filter({ hasText: "(you)" })).toContainText("Owner");
  await checkA11y(page, "members menu");

  // A role picker inside the dropdown: picking keeps the dropdown open.
  await menu.getByRole("combobox", { name: `Role for ${f.sam.name}` }).click();
  await page.getByRole("option", { name: "Viewer" }).click();
  await expect(menu).toBeVisible();
  await expect.poll(async () => (await detail(page, f.projectId)).members.find((m) => m.userId === f.sam.id)?.role).toBe("viewer");

  await menu.getByRole("radio", { name: /Public/ }).click();
  await expect(menu.getByRole("radio", { name: /Public/ })).toHaveAttribute("aria-checked", "true");
  await expect.poll(async () => (await detail(page, f.projectId)).visibility).toBe("public");
  await expect(menu.getByRole("textbox", { name: "Project link" })).toHaveValue(new RegExp(`/p/${f.projectId}$`));
  await page.screenshot({ path: ".tmp/test-results/members-menu.png" });

  await menu.getByRole("button", { name: "Invite people…" }).click();
  await expect(menu).toBeHidden();
  await expect(page.getByRole("region", { name: "Members" }).getByRole("textbox", { name: "Invite by email" })).toBeVisible();
});

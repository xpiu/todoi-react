// The saved-views row (a nav of buttons with a sibling ⋯ menu per view) in every scope. Each case
// creates a view and removes it again, so the scopes run one after the other in one worker.
import { expect, test } from "@playwright/test";
import { nanoid } from "nanoid";

import { gate, SCOPES, seedProjectId, signIn, useScope, type Screen } from "./helpers";

const NAME = "Design this week";

const savedViews: Screen = {
  name: "saved-views",
  open: async (page) => {
    const pid = await seedProjectId(page);
    // Sweep views an interrupted run may have left behind, then create this run's.
    const existing = (await (await page.request.get(`/api/saved-views?projectId=${pid}`)).json()) as Array<{ id: string; name: string }>;
    for (const v of existing.filter((x) => x.name === NAME)) await page.request.delete(`/api/saved-views/${v.id}`);
    const made = await page.request.post("/api/saved-views", { data: { id: nanoid(), projectId: pid, name: NAME, shared: false, definition: { view: "list", filters: [{ type: "label", value: "design" }] } } });
    expect(made.ok(), "create saved view").toBeTruthy();
    const { id } = (await made.json()) as { id: string };
    await page.goto(`/p/${pid}?view=${id}`);
    return async () => void (await page.request.delete(`/api/saved-views/${id}`));
  },
  ready: (page) => page.getByRole("navigation", { name: "Saved views" }).getByRole("button", { name: NAME, exact: true }),
};

test.describe.configure({ mode: "serial" });
for (const scope of SCOPES) {
  test(`${scope} saved-views`, async ({ page }) => {
    await useScope(page, scope);
    await signIn(page);
    await gate(page, scope, savedViews);
  });
}

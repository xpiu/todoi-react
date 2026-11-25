// Import reads spec-conformant Embridge (the format's own demo file) and Todoi project files (JSON and
// YAML): the Review step shows the lists, counts and what was left out — or why a file was refused — and
// Create lands items, subitems, dates, Status and comment threads.
import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

import { trackAccounts, useScope, type Scope } from "./helpers";

trackAccounts(test);

const DEMO = new URL("../fixtures/embridge/fixtures/full-output-demo.md", import.meta.url);

for (const scope of ["rounded-light", "minimal-dark"] as Scope[]) {
  test(`imports the Embridge demo file in ${scope}`, async ({ page }) => {
    await useScope(page, scope);
    await page.goto("/import");
    await page.getByRole("textbox", { name: "Markdown contents" }).fill(await readFile(DEMO, "utf8"));
    await page.getByRole("button", { name: "Review import" }).click();

    const review = page.locator(".td-import-body");
    await expect(page.getByRole("textbox", { name: "Project name" })).toHaveValue("Project title");
    await expect(review.locator(".td-import-list li")).toHaveText(["List with backlog · 2 items · linked to Backlog", "To-do · 2 items · linked to To-do", "In progress · 1 item · linked to Doing", "Done · 1 item · linked to Done"]);
    await expect(page.getByText("4 lists · 6 items · 2 subitems · 2 labels · 10 comments", { exact: false })).toBeVisible();
    await expect(review.locator(".td-import-warn")).toHaveText(["Fields Todoi doesn't use are left out: created, updated", "3 attachment links added to descriptions; the files themselves aren't copied"]);
    await page.screenshot({ path: `.tmp/shots/import-embridge-review-${scope}.png` });
    await review.locator(".td-import-table").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `.tmp/shots/import-embridge-mapping-${scope}.png` });

    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Imported" })).toHaveText(/Imported “Project title”: 4 lists, 6 items, 2 subitems/);
    await expect(page).toHaveURL(/\/p\//);
    const projectId = /\/p\/([^/?]+)/.exec(page.url())![1]!;
    const items = (await (await page.request.get(`/api/items?projectId=${projectId}`)).json()) as Array<{ id: string; title: string; parentItemId: string | null; status: string | null; priority: string | null; dueDate: string | null; done: boolean; description: string | null }>;
    const by = (t: string) => items.find((i) => i.title === t)!;
    expect(by("Research caching strategies")).toMatchObject({ status: "NEW", priority: "HIGH", dueDate: "2025-01-20", description: "lorem ipsum" });
    expect(by("Write API documentation")).toMatchObject({ done: true, status: "DONE" });
    expect(items.filter((i) => i.parentItemId === by("Research caching strategies").id)).toHaveLength(2);
    expect(by("Fix pagination bug").description).toContain("Attachments:\n- [Bug screenshot](assets/pagination-page2.png)");
    const thread = ((await (await page.request.get(`/api/items/${by("Fix pagination bug").id}/details`)).json()) as { comments: Array<{ body: string; replyToId: string | null }> }).comments;
    expect(thread.map((c) => c.body)).toEqual(["**alice** · 2025-01-16\n\nFound the issue in paginate.js line 42", "**bob** · 2025-01-16\n\nCan you push a fix today?", "**alice** · 2025-01-17\n\nDone, see commit abc123", "verified fix works"]);
    expect(thread[1]!.replyToId).not.toBeNull();
    await page.screenshot({ path: `.tmp/shots/import-embridge-project-${scope}.png` });
  });
}

const YAML_FILE = `format: todoi.project
version: 1
title: "Launch plan"
lists:
  - name: "To-do"
    items:
      - title: "Write the announcement"
        priority: high
        due: "2026-12-01"
        labels:
          - "marketing"
        comments:
          - author: "sam"
            text: "Draft is in the doc"
        subitems:
          - title: "Pick a hero image"
  - name: "Done"
    items:
      - title: "Book the venue"
        done: true
`;

for (const scope of ["rounded-dark", "minimal-light"] as Scope[]) {
  test(`imports a Todoi YAML file, and explains a refused JSON file, in ${scope}`, async ({ page }) => {
    await useScope(page, scope);
    await page.goto("/import");
    await page.getByRole("button", { name: "Todoi file" }).click();
    const contents = page.getByRole("textbox", { name: "Todoi file contents" });
    await contents.fill('{"format":"todoi.project","version":1,"lists":[{"name":"L","items":[{"title":"A","subitems":[{"title":"B","subitems":[{"title":"C"}]}]}]}]}');
    await page.getByRole("button", { name: "Review import" }).click();
    await expect(page.locator(".td-import-warn")).toHaveText(["lists[0].items[0].subitems[0] “B”: a subitem can't have its own subitems. Make them subitems of “A” or items in the list"]);
    await expect(page.getByRole("textbox", { name: "Project name" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Create project" })).toBeDisabled();
    await page.locator(".td-import-warn").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `.tmp/shots/import-file-refused-${scope}.png` });

    await contents.fill(YAML_FILE);
    await page.getByRole("button", { name: "Review import" }).click();
    await expect(page.getByRole("textbox", { name: "Project name" })).toHaveValue("Launch plan");
    await expect(page.locator(".td-import-list li")).toHaveText(["To-do · 1 item · linked to To-do", "Done · 1 item · linked to Done"]);
    await expect(page.locator(".td-import-warn")).toHaveCount(0);
    await page.screenshot({ path: `.tmp/shots/import-file-review-${scope}.png` });
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Imported" })).toHaveText(/Imported “Launch plan”: 2 lists, 2 items, 1 subitem/);
    const projectId = /\/p\/([^/?]+)/.exec(page.url())![1]!;
    const items = (await (await page.request.get(`/api/items?projectId=${projectId}`)).json()) as Array<{ title: string; priority: string | null; dueDate: string | null; done: boolean }>;
    expect(items.find((i) => i.title === "Write the announcement")).toMatchObject({ priority: "HIGH", dueDate: "2026-12-01", done: false });
    expect(items.find((i) => i.title === "Book the venue")).toMatchObject({ done: true });
  });
}

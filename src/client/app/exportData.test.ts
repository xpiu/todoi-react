import { describe, expect, it } from "vitest";

import type { Item, Label } from "../data/api";
import { fileSlug, itemToMarkdown, itemsToCsv, viewToMarkdown } from "./exportData";

const item = (over: Partial<Item>): Item =>
  ({ id: "x", projectId: "p", listId: "l1", parentItemId: null, keyNumber: 12, title: "Ship it, \"now\"", description: null, status: "DOING", priorStatus: null, done: false, priority: "HIGH", startDate: null, dueDate: "2026-10-03", dueTime: null, repeatRule: null, repeatCount: 0, cover: null, notification: null, unread: false, position: 0, createdBy: null, archivedAt: null, deletedAt: null, createdAt: "", updatedAt: "", labelIds: ["lb"], assigneeIds: ["u1"], attachmentCount: 0, ...over }) as Item;
const ctx = { prefix: "MP", labels: [{ id: "lb", name: "design" } as Label], people: [{ id: "u1", name: "Flo Z" }], listName: () => "Doing" };

describe("export builders", () => {
  it("writes an item as Markdown with properties, subitems and comments", () => {
    const md = itemToMarkdown(item({ description: "Body **here**" }), ctx, { subitems: [item({ title: "a", done: true }), item({ title: "b" })], comments: [{ author: "Flo Z", body: "ok", date: "Oct 1" }] });
    expect(md.startsWith('# MP-12 Ship it, "now"\n\nList: Doing · Status: Doing · Priority: High · Due: 2026-10-03 · Labels: design · Assignees: Flo Z\n\nBody **here**')).toBe(true);
    expect(md).toContain("- [x] a\n- [ ] b");
    expect(md).toContain("**Flo Z** · Oct 1\n\nok");
  });
  it("writes a view as task lists per list and a CSV with quoting", () => {
    expect(viewToMarkdown("Website", [{ name: "Doing", items: [item({})] }], ctx)).toBe('# Website\n\n## Doing\n\n- [ ] MP-12 Ship it, "now" — High · due 2026-10-03 · #design\n');
    const csv = itemsToCsv([item({})], ctx);
    expect(csv.split("\n")[0]).toBe("Title,List,Status,Priority,Due,Labels,Assignee,Key");
    expect(csv.split("\n")[1]).toBe('"Ship it, ""now""",Doing,Doing,High,2026-10-03,design,Flo Z,MP-12');
    expect(fileSlug("Helicopters Europe website!")).toBe("helicopters-europe-website");
  });
});

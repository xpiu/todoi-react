import { describe, expect, it } from "vitest";

import { parseCsv, parseMarkdown, parseTrello, planCounts } from "./importData";
import { viewToMarkdown } from "./exportData";
import type { Item, Label } from "../data/api";

describe("import parsers", () => {
  it("reads the Markdown Export writes (round trip)", () => {
    const item = (over: Partial<Item>): Item => ({ id: "x", projectId: "p", listId: "l1", parentItemId: null, keyNumber: 12, title: "Ship it", description: null, status: "DOING", priorStatus: null, done: false, priority: "HIGH", startDate: null, dueDate: "2026-10-03", dueTime: null, repeatRule: null, repeatCount: 0, cover: null, notification: null, unread: false, position: 0, createdBy: null, archivedAt: null, deletedAt: null, createdAt: "", updatedAt: "", labelIds: ["lb"], assigneeIds: [], attachmentCount: 0, ...over }) as Item;
    const md = viewToMarkdown("Website", [{ name: "Doing", items: [item({}), item({ title: "Done one", done: true, priority: null, dueDate: null, labelIds: [] })] }], { prefix: "MP", labels: [{ id: "lb", name: "design" } as Label], people: [], listName: () => "Doing" });
    const plan = parseMarkdown(md);
    expect(plan.name).toBe("Website");
    expect(plan.lists[0]!.name).toBe("Doing");
    expect(plan.lists[0]!.statusRole).toBe("DOING");
    expect(plan.lists[0]!.items[0]).toMatchObject({ title: "Ship it", priority: "HIGH", due: "2026-10-03", labels: ["design"], done: false });
    expect(plan.lists[0]!.items[1]).toMatchObject({ title: "Done one", done: true });
    expect(plan.labels).toEqual([{ name: "design", color: undefined }]);
    expect(plan.warnings).toEqual([]);
  });
  it("keeps indented task lines as subitems and paragraphs as descriptions", () => {
    const plan = parseMarkdown("# P\n\n## To-do\n\n- [ ] Parent\nSome notes\n  - [x] child one\n  - [ ] child two\n");
    expect(plan.lists[0]!.items[0]!.subitems).toEqual([{ title: "child one", done: true }, { title: "child two", done: false }]);
    expect(plan.lists[0]!.items[0]!.description).toBe("Some notes");
  });
  it("maps a Trello board", () => {
    const board = { name: "Redesign", lists: [{ id: "L1", name: "Doing", pos: 2 }, { id: "L0", name: "To Do", pos: 1 }, { id: "L9", name: "Old", closed: true }], cards: [{ id: "c1", name: "Hero", desc: "d", idList: "L1", due: "2026-09-12T10:00:00.000Z", labels: [{ name: "Design", color: "purple" }], idChecklists: ["ck1"], idMembers: ["m1", "m2"] }, { id: "c2", name: "Gone", idList: "L9" }], checklists: [{ id: "ck1", idCard: "c1", checkItems: [{ name: "crop", state: "complete" }, { name: "export", state: "incomplete" }] }], members: [{ id: "m1", fullName: "Lena" }] };
    const plan = parseTrello(JSON.stringify(board));
    expect(plan.lists.map((l) => l.name)).toEqual(["To Do", "Doing"]);
    expect(plan.lists[1]!.items[0]).toMatchObject({ title: "Hero", due: "2026-09-12", labels: ["Design"], assignee: "Lena", subitems: [{ title: "crop", done: true }, { title: "export", done: false }] });
    expect(plan.labels).toEqual([{ name: "Design", color: "pink" }]);
    expect(plan.warnings.some((w) => w.includes("several members"))).toBe(true);
  });
  it("reads CSV with quoted cells and ignores unknown columns", () => {
    const plan = parseCsv('Title,List,Due,Labels,Priority,Done,Extra\n"Ship, now",Doing,2026-10-03,"design; shop",High,yes,zzz\nSecond,,,,,no,\n', "Sheet");
    expect(planCounts(plan)).toEqual({ lists: 2, items: 2, subitems: 0, labels: 2 });
    expect(plan.lists[0]!.items[0]).toMatchObject({ title: "Ship, now", due: "2026-10-03", labels: ["design", "shop"], priority: "HIGH", done: true });
    expect(plan.lists[1]!.name).toBe("Imported");
    expect(plan.warnings[0]).toContain("extra");
  });
});

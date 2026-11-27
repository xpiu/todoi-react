import { describe, expect, it } from "vitest";

import { parseCsv, parseMarkdown, parseProjectFile, parseTrello, planCounts } from "./importData";
import { viewToMarkdown } from "./exportData";
import type { Item, Label } from "../data/api";

describe("import parsers", () => {
  it("reads the Markdown Export writes (round trip)", () => {
    const item = (over: Partial<Item>): Item => ({ id: "x", projectId: "p", listId: "l1", parentItemId: null, keyNumber: 12, title: "Ship it", description: null, status: "DOING", priorStatus: null, done: false, priority: "HIGH", startDate: null, dueDate: "2026-10-03", dueTime: null, repeatRule: null, repeatCount: 0, cover: null, notification: null, unread: false, position: 0, createdBy: null, archivedAt: null, deletedAt: null, createdAt: "", updatedAt: "", labelIds: ["lb"], assigneeIds: [], attachmentCount: 0, ...over }) as Item;
    const md = viewToMarkdown("Website", [{ name: "Doing", items: [item({}), item({ title: "Done one", keyNumber: 13, done: true, priority: null, dueDate: null, labelIds: [] })] }], { prefix: "MP", labels: [{ id: "lb", name: "design" } as Label], people: [], listName: () => "Doing" });
    const plan = parseMarkdown(md);
    expect(plan.name).toBe("Website");
    expect(plan.lists[0]!.name).toBe("Doing");
    expect(plan.lists[0]!.statusRole).toBe("DOING");
    expect(plan.lists[0]!.items[0]).toMatchObject({ title: "Ship it", priority: "HIGH", status: "DOING", due: "2026-10-03", labels: ["design"], done: false });
    expect(plan.lists[0]!.items[1]).toMatchObject({ title: "Done one", done: true });
    expect(plan.labels).toEqual([{ name: "design", color: undefined }]);
    expect(plan.warnings).toEqual([]);
  });
  it("reads Embridge: metadata, comments, attachments, deeper nesting flattened", () => {
    const md = [
      "# Backlog",
      "- [ ] Research caching",
      '"Compare Redis and Memcached", prio: med, tags: "research, tech", assignee: @alice, on: 2026-10-01, due: 2026-10-05, id: a1b2c3d, ref: R-9',
      "> @alice [2026-09-20]: Started",
      ">> Thanks",
      "  - [x] Read the docs",
      "    - [ ] Chapter 3",
      "  - ![Chart](assets/chart.png)",
      "",
      "<!--",
      "title: Platform",
      "format: Embridge v0.2.2",
      "-->",
    ].join("\n");
    const plan = parseMarkdown(md, "ignored.md");
    expect(plan.name).toBe("Platform");
    expect(plan.lists[0]).toMatchObject({ name: "Backlog", statusRole: "BACKLOG" });
    const it0 = plan.lists[0]!.items[0]!;
    expect(it0).toMatchObject({ title: "Research caching", priority: "MEDIUM", labels: ["research", "tech"], assignee: "alice", start: "2026-10-01", due: "2026-10-05" });
    expect(it0.description).toBe("Compare Redis and Memcached\n\nAttachments:\n- ![Chart](assets/chart.png)");
    expect(it0.comments).toEqual([{ text: "Started", author: "alice", at: "2026-09-20", depth: 1 }, { text: "Thanks", author: null, at: null, depth: 2 }]);
    expect(it0.subitems.map((s) => [s.title, s.done])).toEqual([["Read the docs", true], ["Chapter 3", false]]);
    expect(plan.warnings).toEqual([
      "“Chapter 3” was a subitem of a subitem, so it's now a direct subitem of “Research caching”. todoi has two levels: items and subitems",
      "Fields todoi doesn't use are left out: ref",
      "1 attachment link added to descriptions; the files themselves aren't copied",
    ]);
  });
  it("names an untitled file after the file", () => {
    expect(parseMarkdown("- [ ] One\n", "groceries.md")).toMatchObject({ name: "groceries", warnings: [] });
    expect(parseMarkdown("- [ ] One\n").warnings).toEqual(["The file has no title, so name the project above"]);
  });
  it("still reads the dialect earlier exports wrote", () => {
    const plan = parseMarkdown("# Website\n\n## Doing\n\n- [ ] MP-12 Ship it — High · due 2026-10-03 · #design\n");
    expect(plan.name).toBe("Website");
    expect(plan.lists[0]!.items[0]).toMatchObject({ title: "Ship it", priority: "HIGH", due: "2026-10-03", labels: ["design"] });
  });
  it("keeps indented task lines as subitems and paragraphs as descriptions (earlier dialect)", () => {
    const plan = parseMarkdown("# P\n\n## To-do\n\n- [ ] Parent\nSome notes\n  - [x] child one\n  - [ ] child two\n");
    expect(plan.lists[0]!.items[0]!.subitems).toEqual([{ title: "child one", done: true }, { title: "child two", done: false }]);
    expect(plan.lists[0]!.items[0]!.description).toBe("Some notes");
  });
  it("reads a todoi project file as YAML or JSON, and explains a refusal", () => {
    const yaml = 'format: todoi.project\nversion: 1\ntitle: "Site"\nlists:\n  - name: "Doing"\n    items:\n      - title: "Hero"\n        status: doing\n        priority: high\n        fields: { ref: "A-7" }\n        subitems:\n          - title: "Crop"\n            done: true\n';
    const plan = parseProjectFile(yaml, "site.yaml");
    expect(plan).toMatchObject({ name: "Site", lists: [{ name: "Doing", statusRole: "DOING", items: [{ title: "Hero", status: "DOING", priority: "HIGH", subitems: [{ title: "Crop", done: true }] }] }] });
    expect(plan.warnings).toEqual(["Fields todoi doesn't use are left out: ref"]);
    const refused = parseProjectFile('{"format":"todoi.project","version":1,"lists":[{"name":"L","items":[{"title":"A","subitems":[{"title":"B","subitems":[]}]}]}]}', "deep.json");
    expect(refused.lists).toEqual([]);
    expect(refused.name).toBe("deep");
    expect(refused.warnings[0]).toBe("lists[0].items[0].subitems[0] “B”: a subitem can't have its own subitems. Make them subitems of “A” or items in the list");
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
    expect(planCounts(plan)).toEqual({ lists: 2, items: 2, subitems: 0, labels: 2, comments: 0 });
    expect(plan.lists[0]!.items[0]).toMatchObject({ title: "Ship, now", due: "2026-10-03", labels: ["design", "shop"], priority: "HIGH", done: true });
    expect(plan.lists[1]!.name).toBe("Imported");
    expect(plan.warnings[0]).toContain("extra");
  });
});

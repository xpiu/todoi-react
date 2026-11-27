import { describe, expect, it } from "vitest";

import { fromEmbridge, toEmbridge } from "./embridge";
import { mergeDocs, withIds } from "./merge";
import { docItem, docSubitem, type DocItem, type ProjectDoc } from "./model";

const doc = (lists: Array<[string, DocItem[]]>, title = "P"): ProjectDoc => ({ title, uuid: null, lists: lists.map(([id, items]) => ({ id, name: id.toUpperCase(), items })) });
const base = doc([
  ["todo", [docItem("Write", { id: "w", labels: ["a"], subitems: [docSubitem("Outline", { id: "w1" }), docSubitem("Draft", { id: "w2" })] }), docItem("Review", { id: "r" }), docItem("Ship", { id: "s" })]],
  ["done", [docItem("Plan", { id: "p", done: true, status: "DONE" })]],
]);
const edit = (d: ProjectDoc, fn: (d: ProjectDoc) => void) => {
  const copy = structuredClone(d);
  fn(copy);
  return copy;
};
const item = (d: ProjectDoc, id: string) => d.lists.flatMap((l) => l.items.flatMap((i) => [i, ...i.subitems])).find((i) => i.id === id);
const titles = (d: ProjectDoc) => d.lists.map((l) => [l.id, l.items.map((i) => (i.subitems.length ? `${i.title}(${i.subitems.map((s) => s.title).join(",")})` : i.title))]);
let n = 0;
const newId = () => `new${n++}`;

describe("mergeDocs", () => {
  it("takes one-sided changes from both sides without conflicts", () => {
    const ours = edit(base, (d) => {
      d.lists[0]!.items[0]!.title = "Write the post";
      d.lists[0]!.items[1]!.priority = "HIGH";
    });
    const theirs = edit(base, (d) => {
      d.lists[0]!.items[0]!.due = "2026-12-01";
      d.lists[0]!.items[2]!.done = true;
      d.lists[0]!.items[2]!.status = "DONE";
    });
    const r = mergeDocs(base, ours, theirs);
    expect(r.conflicts).toEqual([]);
    expect(item(r.doc, "w")).toMatchObject({ title: "Write the post", due: "2026-12-01" });
    expect(item(r.doc, "r")).toMatchObject({ priority: "HIGH" });
    expect(item(r.doc, "s")).toMatchObject({ done: true, status: "DONE" });
    expect(r.changed).toEqual({ ours: true, theirs: true });
  });

  it("reports nothing to do when neither side changed", () => {
    const r = mergeDocs(base, structuredClone(base), structuredClone(base));
    expect(r).toMatchObject({ conflicts: [], changed: { ours: false, theirs: false } });
    expect(r.doc).toEqual(base);
  });

  it("merges sets member by member", () => {
    const ours = edit(base, (d) => {
      d.lists[0]!.items[0]!.labels = ["a", "ours"];
      d.lists[0]!.items[0]!.comments = [{ author: "sam", at: null, text: "from todoi", depth: 1 }];
      d.lists[0]!.items[0]!.fields = { ref: "A" };
    });
    const theirs = edit(base, (d) => {
      d.lists[0]!.items[0]!.labels = ["theirs"];
      d.lists[0]!.items[0]!.comments = [{ author: "bot", at: null, text: "from the file", depth: 1 }];
      d.lists[0]!.items[0]!.fields = { sprint: "12" };
    });
    const r = mergeDocs(base, ours, theirs);
    expect(r.conflicts).toEqual([]);
    expect(item(r.doc, "w")).toMatchObject({ labels: ["ours", "theirs"], fields: { ref: "A", sprint: "12" } });
    expect(item(r.doc, "w")!.comments.map((c) => c.text)).toEqual(["from todoi", "from the file"]);
  });

  it("reports a conflict per field and resolves it by choice or policy", () => {
    const ours = edit(base, (d) => void (d.lists[0]!.items[1]!.title = "Review (todoi)"));
    const theirs = edit(base, (d) => void (d.lists[0]!.items[1]!.title = "Review (file)"));
    const r = mergeDocs(base, ours, theirs);
    expect(r.conflicts).toEqual([{ key: "field:r:title", kind: "field", id: "r", title: "Review (todoi)", field: "title", base: "Review", ours: "Review (todoi)", theirs: "Review (file)" }]);
    expect(r.open).toHaveLength(1);
    expect(item(r.doc, "r")!.title).toBe("Review (todoi)");
    expect(item(mergeDocs(base, ours, theirs, { prefer: "theirs" }).doc, "r")!.title).toBe("Review (file)");
    const chosen = mergeDocs(base, ours, theirs, { choices: { "field:r:title": "theirs" } });
    expect(item(chosen.doc, "r")!.title).toBe("Review (file)");
    expect(chosen.open).toEqual([]);
  });

  it("adds new items from both sides in place, and gives the file's new items ids", () => {
    const ours = edit(base, (d) => void d.lists[0]!.items.splice(1, 0, docItem("From todoi", { id: "t1" })));
    const theirs = edit(base, (d) => void d.lists[0]!.items.push(docItem("From the file")));
    const r = mergeDocs(base, ours, theirs, { newId });
    expect(titles(r.doc)[0]).toEqual(["todo", ["Write(Outline,Draft)", "From todoi", "Review", "Ship", "From the file"]]);
    expect(r.doc.lists[0]!.items.at(-1)!.id).toMatch(/^new\d+$/);
  });

  it("deletes what one side deleted, unless the other side changed it", () => {
    const ours = edit(base, (d) => {
      d.lists[0]!.items.splice(2, 1);
      d.lists[0]!.items[1]!.title = "Review again";
    });
    const theirs = edit(base, (d) => void d.lists[0]!.items.splice(1, 1));
    const r = mergeDocs(base, ours, theirs);
    expect(r.doc.lists[0]!.items.map((i) => i.id)).toEqual(["w", "r"]);
    expect(r.conflicts.map((c) => c.key)).toEqual(["edited-deleted:r"]);
    expect(mergeDocs(base, ours, theirs, { choices: { "edited-deleted:r": "theirs" } }).doc.lists[0]!.items.map((i) => i.id)).toEqual(["w"]);
  });

  it("moves items between lists and keeps a reorder from one side", () => {
    const ours = edit(base, (d) => {
      const [moved] = d.lists[0]!.items.splice(2, 1);
      d.lists[1]!.items.push(moved!);
    });
    const theirs = edit(base, (d) => void d.lists[0]!.items[0]!.subitems.reverse());
    const r = mergeDocs(base, ours, theirs);
    expect(r.conflicts).toEqual([]);
    expect(titles(r.doc)).toEqual([["todo", ["Write(Draft,Outline)", "Review"]], ["done", ["Plan", "Ship"]]]);
  });

  it("keeps a list the file removed when todoi added to it, and asks", () => {
    const ours = edit(base, (d) => void d.lists[1]!.items.push(docItem("Retro", { id: "x" })));
    const theirs = edit(base, (d) => void d.lists.splice(1, 1));
    const r = mergeDocs(base, ours, theirs);
    expect(r.conflicts.map((c) => c.key)).toEqual(["list-removed:done"]);
    expect(titles(r.doc)).toEqual([["todo", ["Write(Outline,Draft)", "Review", "Ship"]], ["done", ["Retro"]]]);
    const dropped = mergeDocs(base, ours, theirs, { prefer: "theirs" });
    // The list goes; what todoi added in it moves to the first list rather than vanishing.
    expect(titles(dropped.doc)).toEqual([["todo", ["Write(Outline,Draft)", "Review", "Ship", "Retro"]]]);
  });

  it("renames lists one-sidedly and conflicts on two renames", () => {
    const ours = edit(base, (d) => void (d.lists[0]!.name = "Next"));
    const theirs = edit(base, (d) => void (d.lists[1]!.name = "Shipped"));
    expect(mergeDocs(base, ours, theirs).doc.lists.map((l) => l.name)).toEqual(["Next", "Shipped"]);
    const both = edit(base, (d) => void (d.lists[0]!.name = "Later"));
    expect(mergeDocs(base, ours, both).conflicts.map((c) => c.key)).toEqual(["list-name:todo"]);
  });

  it("keeps a subitem whose parent the other side deleted, under the parent's list", () => {
    const ours = edit(base, (d) => void (d.lists[0]!.items[0]!.subitems[0]!.done = true));
    const theirs = edit(base, (d) => void d.lists[0]!.items.splice(0, 1));
    const r = mergeDocs(base, ours, theirs, { prefer: "theirs" });
    expect(r.conflicts.map((c) => c.key)).toEqual(["edited-deleted:w1"]);
    expect(titles(r.doc)[0]).toEqual(["todo", ["Review", "Ship"]]);
    const kept = mergeDocs(base, ours, theirs, { choices: { "edited-deleted:w1": "ours" }, prefer: "theirs" });
    expect(titles(kept.doc)[0]).toEqual(["todo", ["Review", "Ship", "Outline"]]);
  });

  it("works across formats: a hand edit to the Markdown merges with a todoi edit", () => {
    const md = toEmbridge(base);
    const handEdited = md.replace("- [ ] Review", "- [x] Review").replace("- [ ] Ship\nid: s", "- [ ] Ship it\nid: s");
    const theirs = fromEmbridge(handEdited).doc;
    const ours = edit(base, (d) => void (d.lists[0]!.items[0]!.priority = "LOW"));
    const r = mergeDocs(fromEmbridge(md).doc, ours, theirs);
    expect(r.conflicts).toEqual([]);
    expect([item(r.doc, "w")!.priority, item(r.doc, "r")!.done, item(r.doc, "s")!.title]).toEqual(["LOW", true, "Ship it"]);
  });

  it("is deterministic and keeps ids stable", () => {
    const theirs = edit(base, (d) => void d.lists[0]!.items.push(docItem("No id"), docItem("Also no id")));
    const a = mergeDocs(base, base, theirs, { newId: () => "fixed01" });
    expect(new Set(a.doc.lists[0]!.items.map((i) => i.id)).size).toBe(a.doc.lists[0]!.items.length);
    expect(withIds(a.doc)).toEqual(a.doc);
  });
});

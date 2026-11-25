import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { fromEmbridge, toEmbridge } from "./embridge";
import { docItem, docSubitem, projectDocSchema, type ProjectDoc } from "./model";

const fixture = (name: string) => readFileSync(join(import.meta.dirname, "../../../tests/fixtures/embridge/fixtures", `${name}.md`), "utf8");

describe("Embridge ⇄ project document", () => {
  it("reads the spec's demo file", () => {
    const { doc, warnings } = fromEmbridge(fixture("full-output-demo"));
    expect(projectDocSchema.parse(doc)).toEqual(doc);
    expect(doc.title).toBe("Project title");
    expect(doc.lists.map((l) => [l.name, l.id])).toEqual([["List with backlog", "p3k9x2a"], ["To-do", "w7q2e1b"], ["In progress", "z8c4r6d"], ["Done", "t5y6u7e"]]);
    const research = doc.lists[0]!.items[0]!;
    expect(research).toMatchObject({ id: "a1b2c3d", title: "Research caching strategies", status: "NEW", priority: "HIGH", labels: ["research", "tech"], assignees: ["alice"], due: "2025-01-20", description: "lorem ipsum", fields: { created: "2025-01-15", updated: "2025-01-18" } });
    expect(research.comments[1]).toEqual({ author: "alice", at: "2025-01-17", text: "Good point, will evaluate both", depth: 1 });
    expect(research.subitems.map((s) => s.title)).toHaveLength(2);
    const bug = doc.lists[1]!.items[0]!;
    expect(bug.attachments).toEqual([
      { label: "Bug screenshot", url: "assets/pagination-page2.png", image: false },
      { label: "Repro video", url: "media/pagination-bug.mp4", image: false },
      { label: "Offset calculation notes", url: "assets/pagination-offset.png", image: true },
    ]);
    expect(bug.comments.map((c) => c.depth)).toEqual([1, 2, 2, 1]);
    expect(doc.lists[3]!.items[0]).toMatchObject({ done: true, status: "DONE" });
    expect(warnings).toEqual([]);
  });

  it("flattens deeper nesting into subitems and says so", () => {
    const { doc, warnings } = fromEmbridge("# L\n- [ ] Top\n  - [ ] Sub\n    - [x] Deep\n      - [ ] Deeper\n      - ![shot](s.png)\n  - [ ] Sub two\n");
    expect(doc.lists[0]!.items[0]!.subitems.map((s) => [s.title, s.done])).toEqual([["Sub", false], ["Deep", true], ["Deeper", false], ["Sub two", false]]);
    expect(doc.lists[0]!.items[0]!.subitems[1]!.attachments).toEqual([{ label: "shot", url: "s.png", image: true }]);
    expect(warnings).toEqual([
      "“Deep” was a subitem of a subitem, so it's now a direct subitem of “Top”. Todoi has two levels: items and subitems",
      "“Deeper” was nested 3 levels under an item, so it's now a direct subitem of “Top”. Todoi has two levels: items and subitems",
    ]);
  });

  it("keeps what Todoi can't use, verbatim, and warns", () => {
    const { doc, warnings } = fromEmbridge("- Call the client\nprio: someday, due: end of Q3, on: 2026-05-02, ref: A-7, status: blocked\nThey prefer mornings\n");
    const it0 = doc.lists[0]!.items[0]!;
    expect(doc.lists[0]!.name).toBe("Items");
    expect(it0).toMatchObject({ done: false, start: "2026-05-02", due: null, priority: null, status: null, fields: { prio: "someday", due: "end of Q3", ref: "A-7", status: "blocked" } });
    expect(warnings).toHaveLength(4);
    expect(warnings[0]).toBe('Line 3, “They prefer mornings”: left out because it isn\'t a field, description or comment. To keep it, put it in quotes ("…") or start it with >');
    expect(warnings[1]).toBe("“Call the client”: Todoi doesn't know the priority “someday”");
  });

  it("repairs a repeated id before anything matches on it", () => {
    const { doc, warnings } = fromEmbridge("- [ ] A\nid: same1234\n- [ ] B\nid: same1234\n", { newId: () => "fresh12" });
    expect(doc.lists[0]!.items.map((i) => i.id)).toEqual(["same1234", "fresh12"]);
    expect(warnings.some((w) => w.includes("“B” shared the id"))).toBe(true);
  });

  it("writes deterministic Markdown that reads back to the same document", () => {
    const doc: ProjectDoc = {
      title: "Website",
      uuid: "0188b200-0000-7000-8000-000000000000",
      lists: [
        {
          id: "w7q2e1b",
          name: "Doing",
          items: [
            docItem("Ship the hero", {
              id: "a1b2c3d",
              status: "DOING",
              priority: "URGENT",
              start: "2026-10-01",
              due: "2026-10-03",
              labels: ["design", "web, mobile"],
              assignees: ["Sam Wilson", "lena"],
              description: 'Two lines\nwith "quotes"',
              comments: [{ author: "sam", at: "2026-09-20 14:30", text: "Looks good\nShip it", depth: 1 }, { author: null, at: null, text: "Agreed", depth: 2 }],
              attachments: [{ label: "Hero [v2]", url: "assets/hero (final).png", image: true }],
              fields: { ref: "A-7", prio: "ignored because Todoi knows the priority" },
              subitems: [docSubitem("Crop", { id: "k9x8y7z", done: true, status: "DONE" })],
            }),
          ],
        },
      ],
    };
    const md = toEmbridge(doc);
    expect(md).toMatchInlineSnapshot(`
      "# Doing
      - [ ] Ship the hero
      "Two lines
      with ""quotes""", status: doing, prio: urgent, tags: "design, web, mobile", assignee: "@Sam Wilson, @lena", on: 2026-10-01, due: 2026-10-03, id: a1b2c3d, ref: A-7
      > @sam [2026-09-20 14:30]: Looks good
      > Ship it
      >> Agreed
        - [x] Crop
        id: k9x8y7z
        - ![Hero [v2\\]](assets/hero (final\\).png)

      <!--
      title: Website
      uuid: 0188b200-0000-7000-8000-000000000000
      lists: "Doing" w7q2e1b
      format: Embridge v0.2.2, github.com/embridge-foundation/embridge
      -->
      "
    `);
    const back = fromEmbridge(md);
    expect(back.warnings).toEqual([]);
    // Labels are comma-separated in Embridge, so a label holding a comma reads back as two.
    const expected = structuredClone(doc);
    expected.lists[0]!.items[0]!.labels = ["design", "web", "mobile"];
    expected.lists[0]!.items[0]!.fields = { ref: "A-7" };
    expect(back.doc).toEqual(expected);
    expect(toEmbridge(back.doc)).toBe(md);
  });
});

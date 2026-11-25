import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { canonicalFields, isAttachmentTitle, parseAttachmentTitle, parseEmbridge, repairDuplicateIds, walkItems, type EmbridgeDocument, type EmbridgeItem } from "./index";
import { writeEmbridge } from "./write";

// The spec's conformance suite, vendored from github.com/embridge-foundation/embridge/tests (v0.2.2).
const SUITE = join(import.meta.dirname, "../../../tests/fixtures/embridge");
const fixtures = readdirSync(join(SUITE, "fixtures")).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, ""));
const read = (name: string) => readFileSync(join(SUITE, "fixtures", `${name}.md`), "utf8");

describe("Embridge conformance suite", () => {
  it("has the fixtures", () => expect(fixtures.length).toBeGreaterThan(50));
  it.each(fixtures)("%s parses to the expected tree", (name) => {
    const expected = JSON.parse(readFileSync(join(SUITE, "expected", `${name}.json`), "utf8")) as EmbridgeDocument;
    const actual = parseEmbridge(read(name));
    expect({ ...actual, diagnostics: [] }).toEqual({ ...expected, diagnostics: [] });
    // Wording may differ (the README says so); the lines and severities may not.
    expect(actual.diagnostics.map((d) => [d.line, d.severity])).toEqual(expected.diagnostics.map((d) => [d.line, d.severity]));
  });
});

/** What a parse means, minus what the writer canonicalizes on purpose (alias names, empty fields, added checkboxes, list ids moved to the registry). */
function meaning(doc: EmbridgeDocument) {
  const item = (node: EmbridgeItem): unknown => {
    const fields = canonicalFields(node.fields);
    const description = node.description ?? fields.description ?? null;
    delete fields.description;
    return { title: node.title.trim(), completed: isAttachmentTitle(node.title) ? null : !!node.completed, fields, description: description || null, comments: node.comments, subitems: node.subitems.map(item) };
  };
  return { title: doc.documentMetadata?.title ?? null, lists: doc.lists.filter((l) => l.title !== null || l.items.length).map((l) => ({ title: l.title, id: l.id ?? null, items: l.items.map(item) })) };
}
const rewrite = (doc: EmbridgeDocument) => writeEmbridge({ title: doc.documentMetadata?.title, sync: doc.documentMetadata?.sync, uuid: doc.documentMetadata?.uuid, fields: doc.documentMetadata?.fields, lists: doc.lists });

describe("writeEmbridge", () => {
  it.each(fixtures)("%s: canonical output is clean, lossless and idempotent", (name) => {
    const parsed = parseEmbridge(read(name));
    // Round-trip-safe output must not repeat an item id, so writers repair duplicates first.
    repairDuplicateIds(parsed);
    const once = rewrite(parsed);
    const reparsed = parseEmbridge(once);
    expect(reparsed.diagnostics).toEqual([]);
    expect(meaning(reparsed)).toEqual(meaning(parsed));
    expect(rewrite(reparsed)).toBe(once);
  });

  it("writes the canonical form", () => {
    const md = writeEmbridge({
      title: "Website",
      uuid: "0188b200-0000-7000-8000-000000000000",
      lists: [
        {
          title: "To-do",
          id: "w7q2e1b",
          items: [
            {
              title: "Fix pagination",
              completed: false,
              fields: { ID: "a1b2c3d", Priority: "high", due: "2026-10-03", tags: "backend, api" },
              description: 'Page 2 shows "duplicates".\nCheck the offset.',
              comments: [{ replyDepth: 1, author: "alice", timestamp: "2026-09-20", text: "Found it" }, { replyDepth: 2, author: null, timestamp: null, text: "Great" }],
              subitems: [
                { title: "Write the test", completed: true },
                { title: "[Spec](docs/spec.pdf)", completed: false },
              ],
            },
            { title: "Ordered", completed: null, marker: { type: "ordered", number: 10 }, subitems: [{ title: "child", completed: false }] },
          ],
        },
      ],
    });
    expect(md).toBe(
      [
        "# To-do",
        "- [ ] Fix pagination",
        '"Page 2 shows ""duplicates"".',
        'Check the offset.", prio: high, tags: "backend, api", due: 2026-10-03, id: a1b2c3d',
        "> @alice [2026-09-20]: Found it",
        ">> Great",
        "  - [x] Write the test",
        "  - [Spec](docs/spec.pdf)",
        "10. [ ] Ordered",
        "    - [ ] child",
        "",
        "<!--",
        "title: Website",
        "uuid: 0188b200-0000-7000-8000-000000000000",
        'lists: "To-do" w7q2e1b',
        "format: Embridge v0.2.2, github.com/embridge-foundation/embridge",
        "-->",
        "",
      ].join("\n"),
    );
  });

  it("keeps values that look like syntax intact", () => {
    const tricky = ["a, b", ' "quoted" ', "", "x: y", "--> end", "line\nbreak"];
    const md = writeEmbridge({ lists: [{ title: "L", items: tricky.map((v, i) => ({ title: `[ ] item ${i}`, completed: false, fields: { note: v }, description: v || null })) }] });
    const doc = parseEmbridge(md);
    expect(doc.diagnostics).toEqual([]);
    // Descriptions keep every character; field values are trimmed and folded onto one line.
    expect(doc.lists[0]!.items.map((node) => [node.title, node.fields.note ?? "", node.description ?? ""])).toEqual(tricky.map((v, i) => [`[ ] item ${i}`, v.trim().replace(/\n/, " "), v]));
  });
});

describe("identity and conventions", () => {
  it("repairs duplicate item ids, keeping the first", () => {
    const doc = parseEmbridge(read("edge-duplicate-ids"));
    let n = 0;
    const messages = repairDuplicateIds(doc, () => `fresh${n++}`);
    const ids = [...walkItems(doc.lists)].map(({ item }) => canonicalFields(item.fields).id).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("abc123d");
    expect(messages.length).toBeGreaterThan(0);
  });
  it("detects attachment titles per the spec's table", () => {
    const yes = ["[Design spec](docs/spec.pdf)", "![Screenshot](assets/login.png)", "  [Design spec](docs/spec.pdf)  ", "[Spec \\] draft](docs/spec.pdf)", "[Spec](docs/spec\\).pdf)"];
    const no = ["See [Design spec](docs/spec.pdf)", "[Design spec](docs/spec.pdf) notes", "assets/login.png", "[Design spec](docs/spec.pdf", "[Spec](docs/spec).pdf)"];
    expect(yes.map(isAttachmentTitle)).toEqual(yes.map(() => true));
    expect(no.map(isAttachmentTitle)).toEqual(no.map(() => false));
    expect(parseAttachmentTitle("![Shot](a\\)b.png)")).toEqual({ kind: "image", label: "Shot", url: "a)b.png" });
  });
  it("folds aliases and lets the last value win", () => {
    expect(canonicalFields({ Priority: "low", prio: "high", duedate: "2026-01-02", Ref: "A", id: " " })).toEqual({ prio: "high", due: "2026-01-02", ref: "A" });
  });
});

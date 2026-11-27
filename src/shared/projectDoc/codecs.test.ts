import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

import { CODECS, codecForPath, FILE_FORMATS } from "./codecs";
import { fromEmbridge } from "./embridge";
import { projectFileJsonSchema, ProjectFileError } from "./file";
import { fromJson, toJson } from "./json";
import { docItem, docSubitem, type ProjectDoc } from "./model";
import { fromYaml, toYaml } from "./yaml";

const rich: ProjectDoc = {
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
          labels: ["design", "no"],
          assignees: ["Sam Wilson"],
          description: "Two lines\nwith \"quotes\" and: colons\n  - not a list",
          comments: [{ author: "sam", at: "2026-09-20 14:30", text: "Looks good", depth: 1 }, { author: null, at: null, text: "Agreed", depth: 2 }],
          attachments: [{ label: "Hero", url: "assets/hero.png", image: true }],
          fields: { ref: "A-7", version: "1.10" },
          subitems: [docSubitem("Crop", { id: "k9x8y7z", done: true, status: "DONE" }), docSubitem("true", { id: "0012" })],
        }),
        docItem("1.10"),
      ],
    },
    { id: null, name: "Empty", items: [] },
  ],
};

describe("codecs", () => {
  it.each(FILE_FORMATS)("%s round-trips a document and writes the same bytes twice", (format) => {
    const codec = CODECS[format];
    const text = codec.serialize(rich);
    const back = codec.parse(text);
    expect(back.warnings).toEqual([]);
    expect(back.doc).toEqual(rich);
    expect(codec.serialize(back.doc)).toBe(text);
  });

  it("converts between formats without loss", () => {
    const fromMd = fromEmbridge(CODECS.embridge.serialize(rich)).doc;
    expect(fromYaml(toYaml(fromJson(toJson(fromMd)).doc)).doc).toEqual(fromMd);
  });

  it("picks a codec by extension", () => {
    expect(codecForPath("todo/Website.MD")?.format).toBe("embridge");
    expect(codecForPath("tasks.yml")?.format).toBe("yaml");
    expect(codecForPath("tasks.json")?.format).toBe("json");
    expect(codecForPath("tasks.txt")).toBeNull();
  });
});

describe("JSON", () => {
  it("writes a compact, ordered file", () => {
    expect(JSON.parse(toJson(rich)).lists[0].items[1]).toEqual({ title: "1.10", done: false });
    expect(Object.keys(JSON.parse(toJson(rich)))).toEqual(["$schema", "format", "version", "title", "uuid", "lists"]);
  });
  it.each([
    ["{", /^Not valid JSON/],
    ['{"format":"todoi.project","version":2,"lists":[]}', /^version: must be 1$/],
    ['{"format":"todoi.project","version":1,"lists":[{"name":"L","items":[{"title":"A","colour":"red"}]}]}', /^lists\[0\]\.items\[0\] “A”: “colour” isn't a project file property\. Remove it, or keep it in the file under fields$/],
    ['{"format":"todoi.project","version":1,"lists":[{"name":"L","items":[{"title":"A","subitems":[{"title":"B","subitems":[{"title":"C"}]}]}]}]}', /^lists\[0\]\.items\[0\]\.subitems\[0\] “B”: a subitem can't have its own subitems\. Make them subitems of “A” or items in the list$/],
    ['{"format":"todoi.project","version":1,"lists":[{"name":"L","items":[{"title":"A","due":"2026-02-31"}]}]}', /^lists\[0\]\.items\[0\]\.due “A”: must be a real date, YYYY-MM-DD$/],
  ])("refuses %s with a message that says where", (text, message) => {
    expect(() => fromJson(text)).toThrow(ProjectFileError);
    expect(() => fromJson(text)).toThrow(message);
  });
});

describe("YAML", () => {
  it("quotes every string, so nothing changes type on the way back", () => {
    const yaml = toYaml(rich);
    expect(yaml).toContain('  - "no"');
    expect(yaml).toContain('title: "1.10"');
    expect(yaml).toContain("done: false");
    expect(yaml).toContain("description: |-\n");
  });
  it("reads plain scalars as text except where a boolean or number belongs", () => {
    const { doc } = fromYaml("format: todoi.project\nversion: 1\nlists:\n  - name: Norway\n    items:\n      - title: no\n        done: false\n        labels: [on, 1.10, true]\n      - title: 1.10\n        done: true\n");
    expect(doc.lists[0]!.items.map((i) => [i.title, i.done, i.labels])).toEqual([["no", false, ["on", "1.10", "true"]], ["1.10", true, []]]);
  });
  it.each([
    ["format: todoi.project\nversion: 1\nlists:\n  - &l\n    name: A\n  - *l\n", /must not use anchors or aliases/],
    ["format: todoi.project\nversion: 1\nlists:\n  - name: !!binary aGk=\n", /must not use tags like !!binary/],
    ["format: todoi.project\nversion: 1\nlists: []\nlists: []\n", /^Not valid YAML \(line 4\): Map keys must be unique/],
    ["format: todoi.project\nversion: 1\nlists:\n  - name: L\n    items:\n      - title: A\n        done: yes\n", /^lists\[0\]\.items\[0\]\.done “A”: must be true or false$/],
  ])("refuses unsafe or invalid YAML (%#)", (text, message) => {
    expect(() => fromYaml(text)).toThrow(message);
  });
});

describe("the published JSON Schema", () => {
  const published = join(import.meta.dirname, "../../../public/schema/project-v1.json");
  it("matches the file schema (UPDATE_SCHEMA=1 npm test rewrites it)", () => {
    const current = `${JSON.stringify(projectFileJsonSchema(), null, 2)}\n`;
    if (process.env.UPDATE_SCHEMA) writeFileSync(published, current);
    expect(readFileSync(published, "utf8")).toBe(current);
  });
  it("accepts what todoi writes and refuses what todoi refuses", () => {
    const validate = addFormats(new Ajv2020({ strict: false })).compile(projectFileJsonSchema());
    expect(validate(JSON.parse(toJson(rich))), JSON.stringify(validate.errors)).toBe(true);
    const bad = (patch: (f: { lists: Array<{ items: Array<Record<string, unknown>> }> }) => void) => {
      const f = JSON.parse(toJson(rich));
      patch(f);
      return validate(f);
    };
    expect(bad((f) => (f.lists[0]!.items[0]!.colour = "red"))).toBe(false);
    expect(bad((f) => (f.lists[0]!.items[0]!.due = "2026-02-29"))).toBe(false);
    expect(bad((f) => ((f.lists[0]!.items[0]!.subitems as Array<Record<string, unknown>>)[0]!.subitems = []))).toBe(false);
    expect(bad((f) => (f.lists[0]!.items[0]!.status = "blocked"))).toBe(false);
  });
  it("forbids unknown properties and subitems under subitems", () => {
    const schema = projectFileJsonSchema() as { additionalProperties?: boolean; properties: Record<string, unknown> };
    expect(schema.additionalProperties).toBe(false);
    expect(JSON.stringify(schema)).toContain("a subitem has no subitems");
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { renderMarkdown } from "./Markdown";

const html = (src: string, o?: Parameters<typeof renderMarkdown>[1]) => renderToStaticMarkup(<>{renderMarkdown(src, o)}</>);

describe("renderMarkdown", () => {
  it("renders headings, paragraphs and line breaks", () => {
    expect(html("# Title\n\nOne\ntwo")).toBe("<h1>Title</h1><p>One<br/>two</p>");
    expect(html("### Small")).toBe("<h3>Small</h3>");
    expect(html("#### Not a heading")).toBe("<p>#### Not a heading</p>");
  });
  it("renders bullet, numbered and task lists", () => {
    expect(html("- a\n- b")).toBe("<ul><li>a</li><li>b</li></ul>");
    expect(html("1. a\n2) b")).toBe("<ol><li>a</li><li>b</li></ol>");
    const task = html("- [ ] open\n- [x] done");
    expect(task).toContain('class="td-md-task"');
    expect(task).toContain('data-on="false"');
    expect(task).toContain('class="td-md-task-done"');
  });
  it("renders quotes and fenced code without touching inline syntax inside the fence", () => {
    expect(html("> a\n> b")).toBe("<blockquote>a b</blockquote>");
    expect(html("```\n**raw**\n```")).toBe("<pre><code>**raw**</code></pre>");
  });
  it("renders the inline subset", () => {
    expect(html("**b** *i* _i_ ~~s~~ `c`")).toBe("<p><strong>b</strong> <em>i</em> <em>i</em> <del>s</del> <code>c</code></p>");
    expect(html("[Todoi](https://todoi.com) and https://x.y/z")).toBe(
      '<p><a href="https://todoi.com" target="_blank" rel="noopener noreferrer">Todoi</a> and <a href="https://x.y/z" target="_blank" rel="noopener noreferrer">x.y/z</a></p>',
    );
  });
  it("highlights only known mentions and marks item keys", () => {
    const members = [{ name: "Flo Zuallaert", nickname: "flo" }];
    expect(html("hi @flo and @nobody", { members })).toBe('<p>hi <span class="td-md-mention">@flo</span> and @nobody</p>');
    expect(html("see MP-112 now")).toBe('<p>see <span class="td-md-key">MP-112</span> now</p>');
    expect(html("see MP-112 now", { onOpenKey: () => {} })).toContain('role="link"');
  });
  it("never emits raw HTML", () => {
    expect(html("<img src=x onerror=alert(1)>")).toBe("<p>&lt;img src=x onerror=alert(1)&gt;</p>");
  });
});

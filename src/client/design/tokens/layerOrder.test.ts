// The cascade-layer order has to be known before the first stylesheet: the production build emits shared
// component CSS as separate chunks that load ahead of the main sheet, so index.html declares the order
// inline. This keeps that declaration and the design system's own (index.css) the same statement.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";

const here = import.meta.dirname;
const layerStatement = (source: string) => /@layer\s+([a-z]+(?:\s*,\s*[a-z]+)+)\s*;/.exec(source)?.[1]?.replace(/\s+/g, "");

it("index.html declares the design system's layer order ahead of every stylesheet and script module", () => {
  const html = readFileSync(join(here, "../../../../index.html"), "utf8");
  const css = readFileSync(join(here, "../index.css"), "utf8");
  const order = layerStatement(css);
  expect(order).toBe("tokens,base,components,theme");
  const head = html.slice(0, html.indexOf("</head>"));
  expect(layerStatement(head)).toBe(order);
  expect(head).not.toMatch(/rel="stylesheet"/);
});

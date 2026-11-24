import { describe, expect, it } from "vitest";

import { findMatch, searchSnippet } from "./searchSnippet";

const TEXT = "Short intro, then one block per model. Sam takes it if nobody else has started by Friday, and the dealers check the price list before it goes live.";

describe("searchSnippet", () => {
  it("cuts one line around the match at a word, with ellipses where text was left out", () => {
    const s = searchSnippet(TEXT, "friday", { lead: 20, max: 40 })!;
    expect(s.hit).toBe("Friday");
    expect(s.pre.startsWith("…")).toBe(true);
    expect(s.pre).toBe("…has started by ");
    expect(s.post.endsWith("…")).toBe(true);
    expect((s.pre + s.hit + s.post).length).toBeLessThanOrEqual(42);
  });

  it("keeps the whole text when it fits, and collapses whitespace", () => {
    expect(searchSnippet("A rotor\n\n  stand", "rotor")).toEqual({ pre: "A ", hit: "rotor", post: " stand" });
    expect(searchSnippet("  a\n\nb  ", "zzz")).toEqual({ pre: "a b", hit: "", post: "" });
    expect(searchSnippet("", "a")).toBeNull();
    expect(searchSnippet(null, "a")).toBeNull();
  });

  it("finds a query word by word when the words aren't side by side, at the start of a word", () => {
    expect(searchSnippet(TEXT, "dealers price")?.hit).toBe("dealers");
    // "ice" is inside "price", not the start of a word: the whole query still matches first.
    expect(findMatch("the price list", "ice")).toEqual({ at: 6, length: 3 });
    expect(findMatch("the price list", "lis pri")).toEqual({ at: 4, length: 3 });
    expect(findMatch("café (crème)", "crè")).toEqual({ at: 6, length: 3 });
    expect(findMatch("a+b", "a+")).toEqual({ at: 0, length: 2 });
    expect(findMatch("text", "  ")).toBeNull();
  });
});

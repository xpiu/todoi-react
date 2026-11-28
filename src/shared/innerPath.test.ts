import { describe, expect, it } from "vitest";

import { innerPath } from "./innerPath";

describe("innerPath", () => {
  it("keeps a path inside the app, with its query and fragment", () => {
    expect(innerPath("/settings?s=storage&connect=p1#top", "/")).toBe("/settings?s=storage&connect=p1#top");
    expect(innerPath("/i/abc", "/")).toBe("/i/abc");
  });
  it("falls back for anything a browser would take to another site", () => {
    for (const next of ["//evil.example", "/\\evil.example", "/\t/evil.example", "/\n/evil.example", "\\\\evil.example", "https://evil.example", "javascript:alert(1)", "evil.example", "", undefined, null]) expect(innerPath(next, "/home")).toBe("/home");
  });
});

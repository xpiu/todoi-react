import { describe, expect, it } from "vitest";

import { BUILD } from "../shared/build";
import { app } from "./app";

describe("the API's response headers", () => {
  it("hardens every response, refusals included", async () => {
    for (const path of ["/api/health", "/api/not-a-route"]) {
      const { headers } = await app.request(path);
      expect(Object.fromEntries(["x-content-type-options", "x-frame-options", "referrer-policy", "cross-origin-resource-policy", "strict-transport-security"].map((name) => [name, headers.get(name)]))).toEqual({
        "x-content-type-options": "nosniff",
        "x-frame-options": "SAMEORIGIN",
        "referrer-policy": "no-referrer",
        "cross-origin-resource-policy": "same-origin",
        "strict-transport-security": "max-age=15552000",
      });
    }
  });
});

describe("/api/health", () => {
  it("names the running build, so a deploy and a bug report can be matched to a commit", async () => {
    const res = await app.request("/api/health");
    // The image's build stamps the commit and time (vite.config.ts); unbundled, as here, it reads "dev".
    expect(await res.json()).toEqual({ ok: true, build: BUILD });
    expect(BUILD.sha).toBeTruthy();
  });
});

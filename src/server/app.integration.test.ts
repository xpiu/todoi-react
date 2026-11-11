import { describe, expect, it } from "vitest";

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

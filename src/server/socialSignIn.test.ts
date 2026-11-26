import { describe, expect, it } from "vitest";

import { SOCIAL_PROVIDERS, unavailableMessage } from "../shared/socialSignIn";
import { socialProvidersFor } from "./socialSignIn";

const configured = { GITHUB_CLIENT_ID: "gh-id", GITHUB_CLIENT_SECRET: "gh-secret", GOOGLE_CLIENT_ID: "g-id", GOOGLE_CLIENT_SECRET: "g-secret" };

describe("social sign-in", () => {
  it("stays off for now, even with credentials, and says so on the pages", () => {
    expect(SOCIAL_PROVIDERS.map((p) => [p.id, p.available])).toEqual([["github", false], ["google", false]]);
    expect(socialProvidersFor(configured)).toEqual({});
    expect(SOCIAL_PROVIDERS.map(unavailableMessage)).toEqual(["GitHub login temporarily unavailable", "Google login temporarily unavailable"]);
  });

  it("registers a provider once it is switched on and both of its credentials are set", () => {
    const on = SOCIAL_PROVIDERS.map((p) => ({ ...p, available: true }));
    expect(socialProvidersFor(configured, on)).toEqual({ github: { clientId: "gh-id", clientSecret: "gh-secret" }, google: { clientId: "g-id", clientSecret: "g-secret" } });
    expect(socialProvidersFor({ GITHUB_CLIENT_ID: "gh-id" }, on)).toEqual({});
  });
});

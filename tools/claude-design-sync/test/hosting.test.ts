// Running locally (loopback, no login) or hosted (beyond loopback, behind a login, pushing merges)
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { git } from "../src/engine/git";
import { pushBranch } from "../src/engine/worktree";
import { hostingFromEnv } from "../src/server/hosting";
import { createApp } from "../src/server/main";
import { makeFixture, type Fixture } from "./fixture";

let fx: Fixture | undefined;
afterEach(() => {
  if (fx) rmSync(dirname(fx.repo), { recursive: true, force: true });
  fx = undefined;
});

describe("hosting", () => {
  it("defaults to this machine only, with no login and no push", () => {
    expect(hostingFromEnv({})).toEqual({ host: "127.0.0.1", port: 4477, auth: undefined, pushAfterMerge: false });
  });

  it("refuses to serve beyond loopback without a login, or with half of one", () => {
    expect(() => hostingFromEnv({ CDS_HOST: "0.0.0.0" })).toThrow(/needs CDS_BASIC_AUTH_USER/);
    expect(() => hostingFromEnv({ CDS_BASIC_AUTH_USER: "flo" })).toThrow(/both/);
    expect(hostingFromEnv({ CDS_HOST: "0.0.0.0", CDS_PORT: "8080", CDS_BASIC_AUTH_USER: "flo", CDS_BASIC_AUTH_PASS: "pw", CDS_PUSH_AFTER_MERGE: "1" }))
      .toEqual({ host: "0.0.0.0", port: 8080, auth: { username: "flo", password: "pw" }, pushAfterMerge: true });
  });

  it("asks for the login everywhere but the health check", async () => {
    fx = makeFixture();
    const app = createApp(fx.ctx, { fake: { designDir: fx.designNowDir }, hosting: { auth: { username: "flo", password: "pw" }, pushAfterMerge: false } });
    expect((await app.request("/healthz")).status).toBe(200);
    expect((await app.request("/api/state")).status).toBe(401);
    expect((await app.request("/api/state", { headers: { authorization: "Basic " + Buffer.from("flo:wrong").toString("base64") } })).status).toBe(401);
    expect((await app.request("/api/state", { headers: { authorization: "Basic " + Buffer.from("flo:pw").toString("base64") } })).status).toBe(200);
  });

  it("pushes a merged branch to origin", () => {
    fx = makeFixture();
    const origin = mkdtempSync(join(tmpdir(), "cds-origin-"));
    try {
      git(origin, ["init", "-q", "--bare"]);
      git(fx.repo, ["remote", "add", "origin", origin]);
      const branch = git(fx.repo, ["symbolic-ref", "--short", "HEAD"]).trim();
      pushBranch(fx.ctx, branch);
      expect(git(origin, ["rev-parse", branch]).trim()).toBe(git(fx.repo, ["rev-parse", "HEAD"]).trim());
      git(fx.repo, ["remote", "set-url", "origin", join(origin, "missing")]);
      expect(() => pushBranch(fx!.ctx, branch)).toThrow();
    } finally {
      rmSync(origin, { recursive: true, force: true });
    }
  });
});

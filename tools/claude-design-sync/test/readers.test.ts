import { rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";

import { readersFor } from "../src/engine/compare";
import * as git from "../src/engine/git";
import { getSnapshot, listSnapshots, listSyncPoints, snapshotFilesDir } from "../src/engine/snapshots";
import { makeFixture, type Fixture } from "./fixture";

let fx: Fixture | undefined;
afterEach(() => {
  vi.restoreAllMocks();
  if (fx) rmSync(dirname(fx.repo), { recursive: true, force: true });
  fx = undefined;
});

it("reuses immutable Git reads, including missing files, while keeping current reads fresh", () => {
  fx = makeFixture();
  const show = vi.spyOn(git, "showAt");
  const readers = readersFor(fx.ctx, listSyncPoints(fx.ctx)[0]!, getSnapshot(fx.ctx, fx.nowSnapshot));
  expect(readers.appBase!("DESIGN.md")).toContain("Boards show lists.");
  readers.appBase!("DESIGN.md");
  expect(readers.appBase!("missing.tsx")).toBeNull();
  expect(readers.appBase!("missing.tsx")).toBeNull();
  expect(show).toHaveBeenCalledTimes(2);
  const before = readers.appNow("DESIGN.md");
  writeFileSync(join(fx.repo, "DESIGN.md"), "Edited now");
  expect(readers.appNow("DESIGN.md")).not.toBe(before);
  expect(readers.appNow("DESIGN.md")).toBe("Edited now");
});

it("lists snapshot metadata without traversing project contents", () => {
  fx = makeFixture();
  const before = listSnapshots(fx.ctx);
  symlinkSync(join(fx.repo, "does-not-exist"), join(snapshotFilesDir(fx.ctx, fx.nowSnapshot), "broken-link"));
  expect(listSnapshots(fx.ctx)).toEqual(before);
});

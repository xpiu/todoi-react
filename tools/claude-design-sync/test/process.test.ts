import { getEventListeners } from "node:events";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chromium } from "@playwright/test";

import { runHarness } from "../src/engine/harness";
import { loadConfig } from "../src/engine/config";
import { checkCards } from "../src/engine/kit";
import { importExport } from "../src/engine/snapshots";
import { runCheck, type AppRun } from "../src/engine/worktree";

let root: string;
let bin: string;
let run: AppRun;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "cds-process-test-"));
  bin = join(root, "harness.mjs");
  run = { worktree: root, branch: "test", base: "test", into: "main", commits: [], state: "working" };
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});
const script = (source: string) => writeFileSync(bin, `#!${process.execPath}\n${source}`, { mode: 0o755 });
const harness = (signal: AbortSignal, on: Parameters<typeof runHarness>[1] = () => {}) => runHarness({ kind: "claude", bin, cwd: root, prompt: "test", signal }, on);

describe("subprocess lifecycle", () => {
  it("does not spawn harnesses or checks after cancellation", async () => {
    const marker = join(root, "started");
    script(`import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'started');`);
    const controller = new AbortController();
    controller.abort();
    expect((await harness(controller.signal)).ok).toBe(false);
    expect((await runCheck(run, `./harness.mjs`, controller.signal)).ok).toBe(false);
    expect(existsSync(marker)).toBe(false);
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
  });

  it("releases shared abort listeners after successful harnesses and checks", async () => {
    script(`console.log(JSON.stringify({type:'result',subtype:'success',result:'done'}));`);
    const controller = new AbortController();
    for (let i = 0; i < 3; i++) {
      expect((await harness(controller.signal)).ok).toBe(true);
      expect((await runCheck(run, "./harness.mjs", controller.signal)).ok).toBe(true);
      expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
    }
  });

  it("releases abort listeners when a harness cannot start", async () => {
    const controller = new AbortController();
    expect((await harness(controller.signal)).ok).toBe(false);
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
  });

  it.each([false, true])("stops a running harness and its descendant (ignores TERM: %s)", async (stubborn) => {
    const marker = join(root, "child.pid");
    script(`
      import {spawn} from 'node:child_process';
      import {writeFileSync} from 'node:fs';
      const child = spawn(process.execPath, ['-e', ${JSON.stringify("process.on('SIGTERM'," + (stubborn ? "()=>{}" : "()=>process.exit(0)") + "); process.send('ready'); setInterval(()=>{},1000)")}], {stdio:['ignore','ignore','ignore','ipc']});
      writeFileSync(${JSON.stringify(marker)}, String(child.pid));
      child.once('message', () => console.log(JSON.stringify({type:'assistant',message:{content:[{type:'text',text:'ready'}]}})));
    `);
    const controller = new AbortController();
    let childPid: number | undefined;
    try {
      const result = await harness(controller.signal, (event) => {
        if (event.type === "text" && event.text === "ready") {
          childPid = Number(readFileSync(marker, "utf8"));
          controller.abort();
        }
      });
      expect(result.ok).toBe(false);
      expect(childPid).toBeDefined();
      await vi.waitFor(() => expect(() => process.kill(childPid!, 0)).toThrow(), { timeout: 2500 });
      expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
    } finally {
      if (childPid) try { process.kill(childPid, "SIGKILL"); } catch { /* already stopped */ }
    }
  });

  it("stops an App check and releases its abort listener", async () => {
    const marker = join(root, "started");
    script(`import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'started'); setInterval(()=>{},1000);`);
    const controller = new AbortController();
    const checking = runCheck(run, "./harness.mjs", controller.signal);
    try {
      await vi.waitFor(() => expect(existsSync(marker)).toBe(true));
    } finally {
      controller.abort();
    }
    expect((await checking).ok).toBe(false);
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
  });
});

it("closes the preview server when Chromium cannot start", async () => {
  vi.spyOn(chromium, "launch").mockRejectedValue(new Error("Browser launch failed"));
  const close = vi.spyOn(Server.prototype, "close");
  await expect(checkCards(root, [])).rejects.toThrow("Browser launch failed");
  expect(close).toHaveBeenCalledOnce();
});

it("removes the extraction directory when importing a corrupt zip fails", () => {
  vi.stubEnv("TMPDIR", root);
  const source = join(root, "corrupt.zip");
  writeFileSync(source, "not a zip");
  expect(() => importExport({ repo: root, state: join(root, "state"), config: loadConfig() }, source)).toThrow();
  expect(readdirSync(root).filter((name) => name.startsWith("cds-import-"))).toEqual([]);
});

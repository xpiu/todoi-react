// A stand-in harness for tests and demos (CDS_FAKE_HARNESS=1): answers DesignSync's read calls from a
// local folder that plays the Claude Design project, and "ports" by appending a marker comment.
// Uploads never run headless (they go through Claude Code), so tests write to that folder themselves.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { Runner } from "./designsync";
import { listFiles } from "./fsutil";
import type { HarnessEvent } from "./harness";

const result = (o: unknown): HarnessEvent => ({ type: "tool-result", content: JSON.stringify(o) });

/** Like Claude Design's: moves whenever a file in the project changes */
const updatedAt = (dir: string) => new Date(Math.max(0, ...listFiles(dir).map((f) => statSync(join(dir, f)).mtimeMs))).toISOString();

/** `delayMs` and `costUsd`: how long each call takes and what it reports spending (tests of the bar's flame); `projectId`: the project the folder plays */
export function fakeRunner(designDir: string, repo: string, { delayMs = 30, costUsd = 0, projectId = "fake" }: { delayMs?: number; costUsd?: number; projectId?: string } = {}): Runner {
  return async (prompt, _opts, on) => {
    const emit = (e: HarnessEvent) => on(e);
    await new Promise((r) => setTimeout(r, delayMs));
    if (prompt.includes('"list_projects"')) {
      // a second project, so switching the target can be tried
      emit(result({ method: "list_projects", projects: [{ projectId, name: "Fake Design System", updatedAt: updatedAt(designDir) }, { projectId: "fake-2", name: "Other Design System", updatedAt: "2026-01-01T00:00:00.000Z" }] }));
    } else if (prompt.includes('"list_files"')) {
      emit(result({ method: "list_files", paths: listFiles(designDir) }));
    } else if (prompt.includes('"get_file"')) {
      for (const m of prompt.matchAll(/^- (.+)$/gm)) {
        const p = m[1]!.trim();
        const f = join(designDir, p);
        if (existsSync(f)) emit(result({ method: "get_file", path: p, content: readFileSync(f, "utf8"), isBase64: false, truncated: false }));
      }
    } else {
      // an implement brief: touch the first listed target file so the run has a visible result; an App
      // port works in its worktree (`repo` here) and ends with a commit, as the brief asks
      const stage = /staging folder (\S+)/.exec(prompt)?.[1];
      const target = /- \*\*([^*]+)\*\* \([^)]*\) — App: ([^ ,·]+)[^·]*· Design: ([^ ,\n]+)/.exec(prompt);
      if (target) {
        const app = target[2] === "none" ? `ported-${target[1]!.replace(/\W+/g, "-")}.txt` : target[2]!;
        const file = stage ? join(stage, target[3]!) : join(repo, app);
        // an App component port also reads a whole store, as a careless translation might: the draft's
        // architecture scan has something to flag
        const careless = !stage && file.endsWith(".tsx") ? "export const useFakePort = () => useKitStore();\n" : "";
        writeFileSync(file, (existsSync(file) ? readFileSync(file, "utf8") : "") + `\n/* ported by the fake harness */\n${careless}`);
        emit({ type: "text", text: `Edited ${file}` });
        if (!stage) {
          execFileSync("git", ["-C", repo, "add", "-A"], { stdio: "ignore" });
          execFileSync("git", ["-C", repo, "-c", "user.name=fake", "-c", "user.email=fake@localhost", "commit", "-qm", `feat: port ${target[1]} (fake)`], { stdio: "ignore" });
        }
      }
    }
    const done: Extract<HarnessEvent, { type: "done" }> = { type: "done", ok: true, result: "DONE", costUsd, turns: 1 };
    emit(done);
    return done;
  };
}

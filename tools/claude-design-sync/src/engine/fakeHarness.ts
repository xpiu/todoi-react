// A stand-in harness for tests and demos (CDS_FAKE_HARNESS=1): answers DesignSync calls from a
// local folder that plays the Claude Design project, and "ports" by appending a marker comment.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { Runner } from "./designsync";
import { listFiles } from "./fsutil";
import type { HarnessEvent } from "./harness";

const result = (o: unknown): HarnessEvent => ({ type: "tool-result", content: JSON.stringify(o) });

export function fakeRunner(designDir: string, repo: string): Runner {
  return async (prompt, _opts, on) => {
    const emit = (e: HarnessEvent) => on(e);
    await new Promise((r) => setTimeout(r, 30));
    if (prompt.includes('"list_projects"')) {
      emit(result({ method: "list_projects", projects: [{ projectId: "fake", name: "Fake Design System", updatedAt: new Date().toISOString() }] }));
    } else if (prompt.includes('"list_files"')) {
      emit(result({ method: "list_files", paths: listFiles(designDir) }));
    } else if (prompt.includes('"get_file"')) {
      for (const m of prompt.matchAll(/^- (.+)$/gm)) {
        const p = m[1]!.trim();
        const f = join(designDir, p);
        if (existsSync(f)) emit(result({ method: "get_file", path: p, content: readFileSync(f, "utf8"), isBase64: false, truncated: false }));
      }
    } else if (prompt.includes('"finalize_plan"')) {
      const local = JSON.parse(/localDir ("[^"]+")/.exec(prompt)![1]!) as string;
      const writes = JSON.parse(/writes (\[[^\]]*\])/.exec(prompt)![1]!) as string[];
      emit(result({ method: "finalize_plan", planId: "plan_fake", writes, deletes: [] }));
      for (const w of writes) {
        mkdirSync(dirname(join(designDir, w)), { recursive: true });
        cpSync(join(local, w), join(designDir, w));
      }
      emit(result({ method: "write_files", written: writes.length }));
    } else {
      // an implement brief: touch the first listed target file so the run has a visible result
      const stage = /staging folder (\S+)/.exec(prompt)?.[1];
      const target = /- \*\*[^*]+\*\* \([^)]*\) — App: ([^ ,·]+)[^·]*· Design: ([^ ,\n]+)/.exec(prompt);
      if (target) {
        const file = stage ? join(stage, target[2]!) : join(repo, target[1]!);
        if (existsSync(file)) writeFileSync(file, readFileSync(file, "utf8") + `\n/* ported by the fake harness */\n`);
        emit({ type: "text", text: `Edited ${file}` });
      }
    }
    const done: Extract<HarnessEvent, { type: "done" }> = { type: "done", ok: true, result: "DONE", costUsd: 0, turns: 1 };
    emit(done);
    return done;
  };
}

// The local AI harness: Claude Code (`claude -p`, the only one with DesignSync) or Codex (`codex exec`).
// Runs stream their events so the server can show a live log and read tool results (pulled files).
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

import { terminateOnAbort } from "./process";

export type HarnessKind = "claude" | "codex";

export interface HarnessInfo {
  ok: boolean;
  path?: string;
  version?: string;
  error?: string;
}

export interface RunOptions {
  kind: HarnessKind;
  bin: string;
  cwd: string;
  prompt: string;
  model?: string;
  /** Claude Code --effort (low | medium | high | xhigh | max) */
  effort?: string;
  /** Claude Code tools allowed without a prompt (the GUI's confirm step is the approval) */
  allowedTools?: string[];
  /** Let the run edit files in cwd */
  edits?: boolean;
  maxTurns?: number;
  signal?: AbortSignal;
  /** Folders outside cwd the run may read (Claude Code --add-dir) */
  addDirs?: string[];
}

export type HarnessEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; input: unknown }
  /** `isError`: the tool refused or failed (Claude Code's is_error) */
  | { type: "tool-result"; content: string; isError?: boolean }
  | { type: "done"; ok: boolean; result: string; costUsd?: number; turns?: number }
  | { type: "stderr"; text: string };

export function commandFor(o: RunOptions): { cmd: string; args: string[] } {
  if (o.kind === "codex") {
    const args = ["exec", "--json", "--skip-git-repo-check", "-C", o.cwd];
    if (o.edits) args.push("--sandbox", "workspace-write");
    if (o.model) args.push("-m", o.model);
    args.push(o.prompt);
    return { cmd: o.bin, args };
  }
  const args = ["-p", o.prompt, "--output-format", "stream-json", "--verbose"];
  if (o.model) args.push("--model", o.model);
  if (o.effort) args.push("--effort", o.effort);
  if (o.maxTurns) args.push("--max-turns", String(o.maxTurns));
  const tools = [...(o.allowedTools ?? [])];
  if (o.edits) tools.push("Read", "Edit", "Write", "Glob", "Grep", "Bash");
  if (tools.length) args.push("--allowedTools", [...new Set(tools)].join(","));
  if (o.edits) args.push("--permission-mode", "acceptEdits");
  if (o.addDirs?.length) args.push("--add-dir", ...o.addDirs);
  return { cmd: o.bin, args };
}

/** Text of a tool_result block; large results were saved by Claude Code to a file it names */
export function toolResultText(content: unknown): string {
  const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((c) => (typeof c === "object" && c && "text" in c ? String((c as { text: unknown }).text) : "")).join("") : "";
  const saved = /Full output saved to: (\S+)/.exec(text);
  if (saved && /<persisted-output>/.test(text)) {
    try {
      return readFileSync(saved[1]!, "utf8");
    } catch {
      return text;
    }
  }
  return text;
}

/** Parse one stream-json line from Claude Code into events */
export function parseClaudeLine(line: string): HarnessEvent[] {
  let e: Record<string, unknown>;
  try {
    e = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return line.trim() ? [{ type: "text", text: line }] : [];
  }
  const out: HarnessEvent[] = [];
  const msg = e.message as { content?: Array<Record<string, unknown>> } | undefined;
  if (e.type === "assistant") for (const c of msg?.content ?? []) {
    if (c.type === "text" && typeof c.text === "string" && c.text.trim()) out.push({ type: "text", text: c.text });
    if (c.type === "tool_use") out.push({ type: "tool", name: String(c.name), input: c.input });
  }
  if (e.type === "user") for (const c of msg?.content ?? []) if (c.type === "tool_result") out.push({ type: "tool-result", content: toolResultText(c.content), ...(c.is_error === true ? { isError: true } : {}) });
  if (e.type === "result") out.push({ type: "done", ok: e.subtype === "success" && !e.is_error, result: String(e.result ?? ""), costUsd: e.total_cost_usd as number | undefined, turns: e.num_turns as number | undefined });
  return out;
}

/** Parse one `codex exec --json` line */
export function parseCodexLine(line: string): HarnessEvent[] {
  let e: Record<string, unknown>;
  try {
    e = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return line.trim() ? [{ type: "text", text: line }] : [];
  }
  const item = (e.item ?? e.msg ?? {}) as Record<string, unknown>;
  const kind = String(item.type ?? e.type ?? "");
  if (/agent_message|message/.test(kind) && typeof item.text === "string") return [{ type: "text", text: item.text }];
  if (/command|exec/.test(kind) && item.command) return [{ type: "tool", name: "shell", input: item.command }];
  if (/turn\.completed|task_complete/.test(kind)) return [{ type: "done", ok: true, result: String(item.last_agent_message ?? "") }];
  if (/error|failed/.test(kind)) return [{ type: "done", ok: false, result: String(item.message ?? e.message ?? "Codex failed") }];
  return [];
}

/** Run the harness, calling onEvent for every event; resolves with the final "done" event */
export function runHarness(o: RunOptions, onEvent: (e: HarnessEvent) => void): Promise<Extract<HarnessEvent, { type: "done" }>> {
  if (o.signal?.aborted) return Promise.resolve({ type: "done", ok: false, result: "Stopped by you" });
  const { cmd, args } = commandFor(o);
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: o.cwd, env: process.env, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
    let done: Extract<HarnessEvent, { type: "done" }> | null = null;
    let buf = "";
    const parse = o.kind === "codex" ? parseCodexLine : parseClaudeLine;
    child.stdout.on("data", (d: Buffer) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        for (const ev of parse(line)) {
          if (ev.type === "done") done = ev;
          onEvent(ev);
        }
      }
    });
    child.stderr.on("data", (d: Buffer) => onEvent({ type: "stderr", text: d.toString() }));
    terminateOnAbort(child, o.signal);
    child.on("error", (err) => resolve({ type: "done", ok: false, result: `Couldn't start ${cmd}: ${err.message}` }));
    child.on("close", (code) => {
      if (buf.trim()) for (const ev of parse(buf)) {
        if (ev.type === "done") done = ev;
        onEvent(ev);
      }
      resolve(o.signal?.aborted ? { type: "done", ok: false, result: "Stopped by you" } : done ?? { type: "done", ok: code === 0, result: code === 0 ? "" : `${cmd} exited with code ${code}` });
    });
  });
}

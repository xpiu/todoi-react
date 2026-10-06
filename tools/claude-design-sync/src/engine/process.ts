// Both the AI harness and App checks own their subprocess groups until they close.
import { spawn, type ChildProcess } from "node:child_process";

/** Stop the process and its descendants, then release the signal listener when it finishes. */
export function terminateOnAbort(child: ChildProcess, signal?: AbortSignal): void {
  if (!signal) return;
  let force: ReturnType<typeof setTimeout> | undefined;
  const kill = (s: NodeJS.Signals) => {
    if (!child.pid) return;
    try {
      if (process.platform === "win32") child.kill(s);
      else process.kill(-child.pid, s);
    } catch {
      // The process group may already have exited.
    }
  };
  const abort = () => {
    kill("SIGTERM");
    force = setTimeout(() => kill("SIGKILL"), 1000);
    force.unref();
  };
  const cleanup = () => {
    signal.removeEventListener("abort", abort);
    // A descendant can outlive the group leader without keeping its streams open.
    if (!signal.aborted) clearTimeout(force);
  };
  child.once("close", cleanup);
  child.once("error", cleanup);
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
}

/** Colour codes some tools print even with NO_COLOR (ESC [ … m) */
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

/** Run a shell command in `cwd`, keeping the last 6,000 characters of its output; Stop ends its whole group */
export function runCommand(cwd: string, command: string, signal?: AbortSignal): Promise<{ command: string; ok: boolean; output: string }> {
  if (signal?.aborted) return Promise.resolve({ command, ok: false, output: "Stopped by you" });
  return new Promise((resolve) => {
    const child = spawn("/bin/sh", ["-c", command], { cwd, env: { ...process.env, CI: "1", FORCE_COLOR: "0", NO_COLOR: "1" }, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const keep = (d: Buffer) => {
      output = (output + d.toString().replace(ANSI, "")).slice(-6000);
    };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    terminateOnAbort(child, signal);
    child.on("error", (e) => resolve({ command, ok: false, output: `Couldn't start: ${e.message}` }));
    child.on("close", (code) => resolve({ command, ok: code === 0 && !signal?.aborted, output }));
  });
}

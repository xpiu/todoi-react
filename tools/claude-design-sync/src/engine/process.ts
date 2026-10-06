// Both the AI harness and App checks own their subprocess groups until they close.
import type { ChildProcess } from "node:child_process";

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

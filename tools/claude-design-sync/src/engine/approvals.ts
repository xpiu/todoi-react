// What a run still waits on the developer for. No Node imports: the server and the GUI both ask.
import type { AppRun } from "./worktree";

/** A verified branch to merge, or a failed one kept for a look */
export const appPending = (j: { app?: Pick<AppRun, "state"> }) => j.app?.state === "ready" || j.app?.state === "failed";

/** Staged kit files still waiting for the upload decision */
export const uploadPending = (j: { staged?: unknown[]; steps: Array<{ id: string; state: string }> }) => !!j.staged?.length && j.steps.find((s) => s.id === "upload")?.state === "pending";

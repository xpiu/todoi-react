// What a run still waits on the developer for. No Node imports: the server and the GUI both ask.
import type { Job } from "../server/jobs";
import type { AppRun } from "./worktree";

/** What the architecture scan (fidelity.ts) looks for in a draft ported from the kit */
export type FidelityRule = "base-ui" | "forwarding" | "aria" | "store" | "click-target" | "story";

export interface FidelityFinding {
  rule: FidelityRule;
  file: string;
  detail: string;
}

/** What a reviewer checks in every draft, whether or not the scan found something */
export const REVIEW_POINTS: Array<{ rule: FidelityRule; label: string }> = [
  { rule: "base-ui", label: "Base UI primitives still carry the behaviour: menus, popovers, dialogs, selects" },
  { rule: "forwarding", label: "Refs and render props still reach the element they belong to" },
  { rule: "store", label: "Zustand reads go through focused selectors; derived values are computed, not stored" },
  { rule: "aria", label: "Roles, ARIA and keyboard behaviour are intact" },
  { rule: "click-target", label: "Anything clickable is a real control: a button, a link, or a Base UI part" },
  { rule: "story", label: "The component's stories still show what ships" },
];

/** A job still in hand: running, paused, or waiting for the developer's approval */
export const isOpen = (j: Pick<Job, "state">) => j.state === "running" || j.state === "awaiting-approval" || j.state === "paused";

/** A running sync run can pause, except while its upload is being checked (that finishes in a moment) */
export const canPause = (j: Pick<Job, "kind" | "state" | "steps">) => j.kind === "run" && j.state === "running" && !j.steps.some((s) => s.id === "upload" && s.state === "running");

/** A ready App branch that came from AI ports and still needs the developer's review before Merge */
export const isDraft = (j: { app?: Pick<AppRun, "state" | "review"> }) => j.app?.state === "ready" && !!j.app.review && !j.app.review.reviewedAt;

/** A verified branch to merge, or a failed one kept for a look */
export const appPending = (j: { app?: Pick<AppRun, "state"> }) => j.app?.state === "ready" || j.app?.state === "failed";

/**
 * A run keeps its temporary files (saved plan, set-aside patches) while it can still go on: running, waiting, paused,
 * or holding a branch (a stopped run's port may still be winding down, its branch about to be kept)
 */
export const keepsRunFiles = (j: Pick<Job, "state" | "app">) => isOpen(j) || appPending(j) || j.app?.state === "working";

/** Staged kit files still waiting for the upload decision */
export const uploadPending = (j: { staged?: unknown[]; steps: Array<{ id: string; state: string }> }) => {
  const state = j.steps.find((s) => s.id === "upload")?.state;
  return !!j.staged?.length && (state === "pending" || state === "failed");
};

/** App ports a run set aside after their attempts failed; the rest of the branch is verified without them */
export const failedPorts = (j: Pick<Job, "steps">) => j.steps.filter((s) => s.target === "app" && s.state === "failed" && s.kind !== "check" && s.kind !== "merge");

/**
 * A paused run goes on from where it stopped. Otherwise recovery currently covers App-only runs; mixed runs also need their kit staging checkpoints. A failed or
 * stopped run resumes on its kept branch; a ready run can retry the features it set aside before Merge.
 */
export const canResume = (j: Pick<Job, "kind" | "state" | "app" | "steps">) => j.kind === "run" && (j.state === "paused"
  || (j.steps.length > 0 && j.steps.every((s) => s.target === "app")
    && (((j.state === "failed" || j.state === "cancelled") && j.app?.state === "failed")
      || (j.state === "awaiting-approval" && j.app?.state === "ready" && failedPorts(j).length > 0))));

// What a run still waits on the developer for. No Node imports: the server and the GUI both ask.
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

/** A ready App branch that came from AI ports and still needs the developer's review before Merge */
export const isDraft = (j: { app?: Pick<AppRun, "state" | "review"> }) => j.app?.state === "ready" && !!j.app.review && !j.app.review.reviewedAt;

/** A verified branch to merge, or a failed one kept for a look */
export const appPending = (j: { app?: Pick<AppRun, "state"> }) => j.app?.state === "ready" || j.app?.state === "failed";

/** Staged kit files still waiting for the upload decision */
export const uploadPending = (j: { staged?: unknown[]; steps: Array<{ id: string; state: string }> }) => {
  const state = j.steps.find((s) => s.id === "upload")?.state;
  return !!j.staged?.length && (state === "pending" || state === "failed");
};

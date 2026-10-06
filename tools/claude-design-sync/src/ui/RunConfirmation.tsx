// Shared review for a whole plan or one feature, before either starts a job.
import { Play } from "lucide-react";
import { plural, type AppState, type Step } from "./api";

export function RunConfirmation({ steps, state, busy, featureTitle, onRun, onBack }: { steps: Step[]; state: AppState | null; busy: boolean; featureTitle?: string; onRun: () => void; onBack: () => void }) {
  const merges = steps.filter((s) => s.kind === "merge-css");
  const pulls = steps.filter((s) => s.kind === "ai-pull");
  const pushes = steps.filter((s) => s.kind === "ai-push");
  const upload = steps.some((s) => s.kind === "upload");
  const work = steps.filter((s) => s.kind !== "upload").length;
  const appWork = steps.some((s) => s.target === "app" && s.kind !== "upload");
  const h = state?.harnesses;
  // App ports run the harness config.json picks: Claude Code, or Codex (untested, so never offered here)
  const harness = state?.implement ?? "claude";
  const app = harness === "codex" ? h?.codex : h?.claude;
  const missing = state?.fake ? null : (pushes.length || upload) && h && !h.claude.ok ? `${h.claude.error} — Claude Code is needed for DesignSync.` : pulls.length && app && !app.ok ? app.error : null;

  return (
    <div className="cds-confirm" role="group" aria-labelledby="confirm-h">
      <h3 id="confirm-h">Run {plural(work, "step")}?</h3>
      {featureTitle ? <p>Only “{featureTitle}” will run. Other features are left out.</p> : null}
      <ul>
        {merges.length ? <li>Writes {plural(merges.length, "token file")} by deterministic rule merge ({merges.filter((s) => s.target === "app").length} on the App branch, {merges.filter((s) => s.target === "design").length} staged for Design).</li> : null}
        {appWork ? (
          <li>
            App work happens on a new branch in a separate git worktree, from {state?.appHead}. Your checkout{state?.dirty ? ", uncommitted changes included," : ""} isn't touched. Afterwards <span className="cds-mono">{state?.check}</span> runs there, and the branch waits in Activity for you to merge it.
          </li>
        ) : null}
        {pulls.length ? (
          <li>
            Runs {harness === "codex" ? "Codex (untested, set in config.json)" : "Claude Code"} {plural(pulls.length, "time")} with permission to edit and run commands in that worktree. Each port must end with its own commit; one that doesn't stops the run.
          </li>
        ) : null}
        {pushes.length ? <li>Runs Claude Code {plural(pushes.length, "time")} to port App work into a staging copy of the kit.</li> : null}
        {upload ? <li>Uploads nothing yet: staged kit files wait in Activity for you to approve the exact list.</li> : null}
      </ul>
      <div className="cds-confirm-actions">
        <button type="button" className="cds-btn cds-btn-primary" disabled={!!missing || busy || !work} data-tip={missing ?? (busy ? "Another job is running. Wait for it to finish" : !work ? "Nothing to run" : "Start these steps now and follow them in Activity. Nothing is merged or uploaded until you approve it")} onClick={onRun}>
          <Play size={14} strokeWidth={1.75} aria-hidden /> Run {plural(work, "step")}
        </button>
        <button type="button" className="cds-btn" onClick={onBack} data-tip="Return to the list of steps without running anything">
          Back to the steps
        </button>
        {missing ? <span className="cds-error-inline">{missing}</span> : busy ? <span className="cds-quiet">Another job is running — see Activity.</span> : null}
      </div>
    </div>
  );
}

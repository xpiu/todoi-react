// Shared review for a whole plan or one feature, before either starts a job.
import { Check, Play } from "lucide-react";
import { plural, type AppState, type SnapshotMeta, type Step } from "./api";
import { canResume } from "../engine/approvals";
import { ArchiveReview } from "./ArchiveReview";

/** A feature the run covers; `parts`: set when only some of its parts are selected */
export interface RunFeature {
  id: string;
  title: string;
  direction: string;
  steps: number;
  parts: string | null;
}

export function RunConfirmation({ steps, features, state, snapshot, busy, featureTitle, onRun, onBack, onImportArchive, onShowJob }: { steps: Step[]; features: RunFeature[]; state: AppState | null; snapshot: SnapshotMeta | null; busy: boolean; featureTitle?: string; onRun: () => void; onBack: () => void; onImportArchive: () => void; onShowJob: (id: string) => void }) {
  const merges = steps.filter((s) => s.kind === "merge-css");
  const pulls = steps.filter((s) => s.kind === "ai-pull");
  const pushes = steps.filter((s) => s.kind === "ai-push");
  const upload = steps.some((s) => s.kind === "upload");
  const work = steps.filter((s) => s.kind !== "upload").length;
  const appWork = steps.some((s) => s.target === "app" && s.kind !== "upload");
  const h = state?.harnesses;
  // App ports run the harness config.json picks: Claude Code, or Codex (untested, so never offered here)
  const harness = state?.implement ?? "claude";
  const attempts = state?.implementAttempts ?? 2;
  const app = harness === "codex" ? h?.codex : h?.claude;
  // A kept run that already finished some of these steps: resuming it keeps that work, a new run redoes it
  const planned = new Set(steps.map((s) => s.id));
  const kept = state?.jobs.find((j) => canResume(j) && j.steps.some((s) => s.state === "done" && planned.has(s.id)));
  const keptDone = kept?.steps.filter((s) => s.state === "done" && planned.has(s.id) && s.kind !== "check").length ?? 0;
  const keptNew = kept ? steps.filter((s) => s.kind !== "upload" && !kept.steps.some((k) => k.id === s.id)).length : 0;
  const missing = state?.fake ? null : (pushes.length || upload) && h && !h.claude.ok ? `${h.claude.error} — Claude Code is needed for DesignSync.` : pulls.length && app && !app.ok ? app.error : null;

  return (
    <div className="cds-confirm" role="group" aria-labelledby="confirm-h">
      <h3 id="confirm-h">Run {plural(work, "step")} for {plural(features.length, "feature")}?</h3>
      {featureTitle ? <p>Only “{featureTitle}” will run. Other features are left out.</p> : null}
      {features.length ? (
        <ul className="cds-run-features" aria-label="Features in this run">
          {features.map((f) => (
            <li key={f.id}>
              <Check size={14} strokeWidth={2} className="cds-run-tick" aria-hidden />
              <span className="cds-run-title">{f.title}</span>
              <span className="cds-kind">
                {f.direction} · {plural(f.steps, "step")}
                {f.parts ? ` · ${f.parts}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {kept ? (
        <div className="cds-confirm-kept" role="note">
          <p>
            <strong>“{kept.title}” already finished {keptDone} of these steps</strong> on <span className="cds-mono">{kept.app?.branch}</span>. Resume it to keep that work and run only what's left; a new run starts every step again.{keptNew ? ` ${plural(keptNew, "selected step")} ${keptNew === 1 ? "isn't" : "aren't"} in that run: run ${keptNew === 1 ? "it" : "them"} after it.` : ""}
          </p>
          <button type="button" className="cds-btn" onClick={() => onShowJob(kept.id)} data-tip="Open that run in Activity, where Resume (or Retry failed features) continues it">
            Show that run
          </button>
        </div>
      ) : null}
      {appWork && state && snapshot ? <ArchiveReview state={state} snapshot={snapshot} onImport={onImportArchive} /> : null}
      <ul>
        {merges.length ? <li>Writes {plural(merges.length, "token file")} by deterministic rule merge ({merges.filter((s) => s.target === "app").length} on the App branch, {merges.filter((s) => s.target === "design").length} staged for Design).</li> : null}
        {appWork ? (
          <li>
            App work happens on a new branch in a separate git worktree, from {state?.appHead}. Your checkout{state?.dirty ? ", uncommitted changes included," : ""} isn't touched. Afterwards <span className="cds-mono">{state?.check}</span> runs there, and the branch waits in Activity for you to merge it.
          </li>
        ) : null}
        {pulls.length ? (
          <li>
            Runs {harness === "codex" ? "Codex (untested, set in config.json)" : "Claude Code"} {plural(pulls.length, "time")} with permission to edit and run commands in that worktree. Each port must end with its own commit.{attempts > 1 ? ` One that doesn't gets ${plural(attempts - 1, "more try", "more tries")} with the failure fed back; if it still fails,` : " One that doesn't"} its partial changes are set aside as a patch and the run carries on, leaving that feature open.
          </li>
        ) : null}
        {pushes.length ? <li>Runs Claude Code {plural(pushes.length, "time")} to port App work into a staging copy of the kit.</li> : null}
        {upload ? <li>Uploads nothing yet: staged kit files wait in Activity for you to approve the exact list.</li> : null}
      </ul>
      <div className="cds-confirm-actions">
        <button type="button" className="cds-btn cds-btn-primary" disabled={!!missing || busy || !work} data-tip={missing ?? (busy ? "Another job is running. Wait for it to finish" : !work ? "Nothing to run" : "Start these steps now and follow them in Activity. Nothing is merged or uploaded until you approve it - Costs tokens")} onClick={onRun}>
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

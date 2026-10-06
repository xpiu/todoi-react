// The plan, pinned to the bottom: what the decisions add up to, every step with its brief, and the
// confirmation that says exactly what a run will write and where. Also: marking a sync point, where
// features this round didn't sync stay open instead of vanishing from the next comparison.
import { ChevronRight, Flag, Play } from "lucide-react";
import { useMemo, useState } from "react";

import { directionsFor, effective, plural, selectedUnitIds, type AppState, type Direction, type Feature, type Step, type Unit } from "./api";
import { StepLine } from "./FeatureRow";
import { MergeButton, type MergeOffer } from "./Merge";

/** A part the plan could move but skips: it stays open at a sync point. Reference-only parts never move, so they never hold a feature open. */
const skipped = (u: Unit, unitChoices: Record<string, Direction>) => directionsFor(u.status, u.kind).directions.some((d) => d !== "skip") && (unitChoices[u.id] ?? "skip") === "skip";

export function PlanBar({ baseId, markUnits, onMarkUnits, steps, features, global, overrides, unitChoices, state, onRun, busy, merge, onSyncPoint }: { baseId: string | null; markUnits: string[] | null; onMarkUnits: (units: string[] | null) => void; steps: Step[]; features: Feature[]; global: Direction; overrides: Record<string, Direction>; unitChoices: Record<string, Direction>; state: AppState | null; onRun: () => void; busy: boolean; merge: MergeOffer; onSyncPoint: (label: string, tag: boolean, hold: string[]) => Promise<void> }) {
  const [planView, setPlanView] = useState<"closed" | "steps" | "confirm">("closed");
  const view = markUnits !== null ? "mark" : planView;
  const setView = (next: typeof planView) => {
    onMarkUnits(null);
    setTicked({});
    setSaveError(null);
    setPlanView(next);
  };
  const open = view !== "closed";
  const [label, setLabel] = useState("");
  const [tag, setTag] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** Explicit selections override the units chosen when the dialog opened. */
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [today] = useState(() => new Date().toISOString().slice(0, 10));

  const t = useMemo(() => {
    const c = { toDesign: 0, toApp: 0, both: 0, skip: 0 };
    for (const f of features) {
      const d = effective(f, global, overrides[f.id]);
      if (d === "skip") c.skip++;
      else if (d === "both") c.both++;
      else if (d === "app-to-design") c.toDesign++;
      else c.toApp++;
    }
    return c;
  }, [features, global, overrides]);
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

  const kinds = ([[t.toDesign, "into Design"], [t.toApp, "into the App"], [t.both, "both ways"]] as const).filter(([n]) => n > 0);
  const moving = t.toDesign + t.toApp + t.both;
  // Persisted job coverage survives reloads and doesn't change when the plan's directions change.
  const lastRun = state?.jobs.find((j) => j.kind === "run");
  const runScope = lastRun?.baseId === baseId && lastRun.covers && !lastRun.syncPointId && lastRun.state !== "cancelled" ? lastRun.covers : null;
  const covered = new Set(markUnits ?? []);
  const keepOpen = (f: Feature) => !(ticked[f.id] ?? f.units.some((u) => covered.has(u.id)));
  const kept = features.filter(keepOpen).length;
  const partOpen = (f: Feature, u: Unit) => directionsFor(u.status, u.kind).directions.some((d) => d !== "skip") && (ticked[f.id] === true ? skipped(u, unitChoices) : !covered.has(u.id));
  const hold = features.flatMap((f) => (keepOpen(f) ? f.units : f.units.filter((u) => partOpen(f, u))).map((u) => u.id));
  const startMark = () => {
    setTicked({});
    setSaveError(null);
    onMarkUnits(runScope ?? features.flatMap((f) => selectedUnitIds(f.units, unitChoices)));
  };
  const summary = !moving ? "Nothing planned" : `${plural(moving, "feature")}${kinds.length === 1 ? ` · ${kinds[0]![1]}` : `: ${kinds.map(([n, l]) => `${n} ${l}`).join(" · ")}`}${t.skip ? ` · ${t.skip} skipped` : ""}`;

  return (
    <div className={`cds-plan ${open ? "is-open" : ""}`} role="region" aria-label="Sync plan">
      {open ? (
        <div className="cds-plan-sheet">
          {view === "confirm" ? (
            <div className="cds-confirm" role="group" aria-labelledby="confirm-h">
              <h3 id="confirm-h">Run {plural(work, "step")}?</h3>
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
                <button type="button" className="cds-btn cds-btn-primary" disabled={!!missing || busy || !work} data-tip={missing ?? (busy ? "Another job is running. Wait for it to finish" : !work ? "Nothing to run" : "Start these steps now and follow them in Activity. Nothing is merged or uploaded until you approve it")} onClick={() => { setView("closed"); onRun(); }}>
                  <Play size={14} strokeWidth={1.75} aria-hidden /> Run {plural(work, "step")}
                </button>
                <button type="button" className="cds-btn" onClick={() => setView("steps")} data-tip="Return to the list of steps without running anything">
                  Back to the steps
                </button>
                {missing ? <span className="cds-error-inline">{missing}</span> : busy ? <span className="cds-quiet">Another job is running — see Activity.</span> : null}
              </div>
            </div>
          ) : view === "mark" ? (
            <form
              className="cds-mark"
              onSubmit={async (e) => {
                e.preventDefault();
                setSaving(true);
                setSaveError(null);
                try {
                  await onSyncPoint(label.trim() || "Synced", tag, hold);
                  setView("closed");
                } catch (error) {
                  setSaveError(error instanceof Error ? error.message : String(error));
                } finally {
                  setSaving(false);
                }
              }}
            >
              <h3>Mark {plural(features.length - kept, "feature")} synced</h3>
              <p className="cds-quiet">Future comparisons start here: the App at {state?.appHead} and the newest Design snapshot. Preparing kit files doesn't upload them. Mark a feature only after its upload or App merge is complete and you've checked the result. Verified runs record their own sync point.</p>
              <label className="cds-field">
                <span>Label</span>
                <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Hidden lists + offline copy" autoFocus data-tip="A name for this sync point, shown in the Since menu. Left empty, it's called Synced" />
              </label>
              {features.length ? (
                <fieldset className="cds-mark-features">
                  <legend>Synced this round</legend>
                  <p className="cds-quiet">Unticked features stay open: they keep their starting point and show up in the next comparison. Ticked ones start over from here.</p>
                  <ul>
                    {features.map((f) => {
                      const open = keepOpen(f);
                      const parts = open ? 0 : f.units.filter((u) => partOpen(f, u)).length;
                      return (
                        <li key={f.id}>
                          <label className="cds-check" data-tip={open ? "Stays open: keeps its starting point and shows up in the next comparison. Tick it if it's synced" : "Synced: starts over from this sync point. Untick it to keep it open"}>
                            <input type="checkbox" checked={!open} onChange={(e) => setTicked((t) => ({ ...t, [f.id]: e.target.checked }))} />
                            <span>
                              {f.title}
                              {parts ? <span className="cds-quiet"> · {plural(parts, "skipped part")} stay{parts === 1 ? "s" : ""} open</span> : null}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
              ) : null}
              <label className="cds-check" data-tip="Tag the App's current commit in git, so this sync point is easy to find later">
                <input type="checkbox" checked={tag} onChange={(e) => setTag(e.target.checked)} /> Also create the git tag {`design-sync/${today}`}
              </label>
              {saveError ? <p className="cds-error-inline" role="alert">{saveError}</p> : null}
              <div className="cds-confirm-actions">
                <button type="submit" className="cds-btn cds-btn-primary" disabled={saving || kept === features.length} data-tip="Record the selected features as synced. All other features and skipped parts keep their old starting point">
                  {saving ? "Saving…" : "Record sync point"}
                </button>
                {kept ? <span className="cds-quiet">{plural(kept, "feature")} stay{kept === 1 ? "s" : ""} open</span> : null}
                <button type="button" className="cds-btn" onClick={() => setView("steps")} data-tip="Return to the steps without recording a sync point">
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              <h3 className="cds-plan-h">Steps, in order</h3>
              {steps.length ? <ol className="cds-steps">{steps.map((s) => <StepLine key={s.id} step={s} />)}</ol> : <p className="cds-quiet">Every feature is skipped. Pick a direction above or on a feature's rail.</p>}
            </>
          )}
        </div>
      ) : null}
      <div className="cds-plan-bar">
        <button type="button" className="cds-plan-toggle" aria-expanded={open} data-tip={open ? "Fold the plan away" : "Show every step the plan will run, in order, with its AI brief"} onClick={() => setView(open ? "closed" : "steps")}>
          <ChevronRight size={14} strokeWidth={1.75} className="cds-chev" aria-hidden />
          <span className="cds-plan-sum">
            <strong>{summary}</strong>
            <span className="cds-quiet">
              {plural(work, "step")}
              {merges.length ? ` · ${plural(merges.length, "merge")}` : ""}
              {pulls.length + pushes.length ? ` · ${plural(pulls.length + pushes.length, "AI port")}` : ""}
              {upload ? " · upload after approval" : ""}
            </span>
          </span>
        </button>
        <div className="cds-plan-actions">
          <button type="button" className="cds-btn" onClick={startMark} data-tip={runScope ? "Review only the latest run’s features as synced. Other features stay open" : "Choose which features are synced. Unticked features stay open"}>
            <Flag size={14} strokeWidth={1.75} aria-hidden /> {runScope ? "Mark run features synced" : "Mark synced"}
          </button>
          {/* a waiting merge takes the primary slot: it is what the plan waits on */}
          <MergeButton offer={merge} place="plan" />
          {view === "confirm" ? null : (
            <button type="button" className={`cds-btn ${merge.ready ? "" : "cds-btn-primary"}`} disabled={!work || busy} data-tip={!work ? "Nothing to run: every feature is skipped" : merge.ready ? "A run waits for your merge (or Discard in Activity) before the next one can start" : busy ? "Another job is running. Wait for it to finish" : "Review exactly what the run will write and where, then start it"} onClick={() => setView("confirm")}>
              <Play size={14} strokeWidth={1.75} aria-hidden /> Run plan
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// The plan, pinned to the bottom: what the decisions add up to, every step with its brief, and the
// confirmation that says exactly what a run will write and where. Also: marking a sync point.
import { ChevronRight, Flag, Play } from "lucide-react";
import { useMemo, useState } from "react";

import { effective, plural, type AppState, type Direction, type Feature, type Step } from "./api";
import { StepLine } from "./FeatureRow";

export function PlanBar({ steps, features, global, overrides, state, harness, onHarness, onRun, busy, onSyncPoint }: { steps: Step[]; features: Feature[]; global: Direction; overrides: Record<string, Direction>; state: AppState | null; harness: "claude" | "codex"; onHarness: (h: "claude" | "codex") => void; onRun: () => void; busy: boolean; onSyncPoint: (label: string, tag: boolean) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [mark, setMark] = useState(false);
  const [label, setLabel] = useState("");
  const [tag, setTag] = useState(true);
  const [saving, setSaving] = useState(false);
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
  const h = state?.harnesses;
  const missing = state?.fake ? null : (pushes.length || upload) && h && !h.claude.ok ? `${h.claude.error} — Claude Code is needed for DesignSync.` : pulls.length && h && !h[harness].ok ? h[harness].error : null;

  const kinds = ([[t.toDesign, "into Design"], [t.toApp, "into the App"], [t.both, "both ways"]] as const).filter(([n]) => n > 0);
  const moving = t.toDesign + t.toApp + t.both;
  const summary = !moving ? "Nothing planned" : `${plural(moving, "feature")}${kinds.length === 1 ? ` · ${kinds[0]![1]}` : `: ${kinds.map(([n, l]) => `${n} ${l}`).join(" · ")}`}${t.skip ? ` · ${t.skip} skipped` : ""}`;

  return (
    <div className={`cds-plan ${open ? "is-open" : ""}`} role="region" aria-label="Sync plan">
      {open ? (
        <div className="cds-plan-sheet">
          {confirm ? (
            <div className="cds-confirm" role="group" aria-labelledby="confirm-h">
              <h3 id="confirm-h">Run {plural(work, "step")}?</h3>
              <ul>
                {merges.length ? <li>Writes {plural(merges.length, "token file")} by deterministic rule merge ({merges.filter((s) => s.target === "app").length} in the repo, {merges.filter((s) => s.target === "design").length} staged for Design).</li> : null}
                {pulls.length ? (
                  <li>
                    Runs{" "}
                    <span className="cds-harness" role="radiogroup" aria-label="Harness for App ports">
                      {(["claude", "codex"] as const).map((k) => (
                        <button key={k} type="button" role="radio" aria-checked={harness === k} disabled={!state?.fake && !h?.[k].ok} title={h?.[k].ok ? h[k].version : h?.[k].error} onClick={() => onHarness(k)}>
                          {k === "codex" ? "Codex" : "Claude Code"}
                        </button>
                      ))}
                    </span>{" "}
                    {plural(pulls.length, "time")} with permission to edit files in {state?.repo.split("/").pop()} and run its checks; each port ends with its own commit.
                    {h && !h.codex.ok && !state?.fake ? <span className="cds-quiet cds-block">Codex: {h.codex.error}</span> : null}
                  </li>
                ) : null}
                {pushes.length ? <li>Runs Claude Code {plural(pushes.length, "time")} to port App work into a staging copy of the kit.</li> : null}
                {upload ? <li>Uploads nothing yet: staged kit files wait in Activity for you to approve the exact list.</li> : null}
              </ul>
              <div className="cds-confirm-actions">
                <button type="button" className="cds-btn cds-btn-primary" disabled={!!missing || busy || !work} onClick={() => { setConfirm(false); setOpen(false); onRun(); }}>
                  <Play size={14} strokeWidth={1.75} aria-hidden /> Run {plural(work, "step")}
                </button>
                <button type="button" className="cds-btn" onClick={() => setConfirm(false)}>
                  Back to the steps
                </button>
                {missing ? <span className="cds-error-inline">{missing}</span> : busy ? <span className="cds-quiet">Another job is running — see Activity.</span> : null}
              </div>
            </div>
          ) : mark ? (
            <form
              className="cds-mark"
              onSubmit={async (e) => {
                e.preventDefault();
                setSaving(true);
                await onSyncPoint(label.trim() || "Synced", tag);
                setSaving(false);
                setMark(false);
                setOpen(false);
              }}
            >
              <h3>Mark both sides as synced</h3>
              <p className="cds-quiet">Future comparisons start here: the App at {state?.appHead} and the newest Design snapshot. Do this after a run finished and you're happy with both sides.</p>
              <label className="cds-field">
                <span>Label</span>
                <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Hidden lists + offline copy" autoFocus />
              </label>
              <label className="cds-check">
                <input type="checkbox" checked={tag} onChange={(e) => setTag(e.target.checked)} /> Also create the git tag {`design-sync/${today}`}
              </label>
              <div className="cds-confirm-actions">
                <button type="submit" className="cds-btn cds-btn-primary" disabled={saving}>
                  {saving ? "Saving…" : "Record sync point"}
                </button>
                <button type="button" className="cds-btn" onClick={() => setMark(false)}>
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
        <button type="button" className="cds-plan-toggle" aria-expanded={open} onClick={() => { setOpen((o) => !o); setConfirm(false); setMark(false); }}>
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
          <button type="button" className="cds-btn" onClick={() => { setOpen(true); setMark(true); setConfirm(false); }}>
            <Flag size={14} strokeWidth={1.75} aria-hidden /> Mark synced
          </button>
          {confirm ? null : (
            <button type="button" className="cds-btn cds-btn-primary" disabled={!work || busy} onClick={() => { setOpen(true); setConfirm(true); setMark(false); }}>
              <Play size={14} strokeWidth={1.75} aria-hidden /> Run plan
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

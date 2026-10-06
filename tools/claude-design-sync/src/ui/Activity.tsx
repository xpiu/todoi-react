// Activity: jobs with live logs. A run stops here for approval: its verified App branch waits for Merge
// (commits listed), its staged kit files for Upload (every file listed, cards checked, previews), and
// Discard gives up whatever is still waiting. A run waiting for Merge is pinned above the log even while
// another job is shown.
import { CircleAlert, Check, GitMerge, LoaderCircle, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { api, appPending, fmtTime, plural, subscribeJob, uploadPending, type AppState, type Job } from "./api";
import { MergeButton, MergeStrip, type MergeOffer } from "./Merge";
import { TIP } from "./Tooltip";

const STATE_WORD: Record<Job["state"], string> = { running: "running", "awaiting-approval": "waiting for your approval", done: "done", failed: "failed", cancelled: "stopped" };

export function Activity({ state, merge, focus, onFocus, onClose, onChanged }: { state: AppState | null; merge: MergeOffer; focus: string | null; onFocus: (id: string) => void; onClose: () => void; onChanged: () => void }) {
  const jobs = state?.jobs ?? [];
  const id = focus ?? jobs[0]?.id ?? null;
  const [job, setJob] = useState<Job | null>(null);
  const logRef = useRef<HTMLOListElement>(null);
  const changed = useRef(onChanged);
  useEffect(() => {
    changed.current = onChanged;
  });

  useEffect(() => {
    if (!id) return;
    return subscribeJob(id, (nextJob, event) => {
      setJob((prev) => event ? { ...nextJob, events: [...(prev?.id === nextJob.id ? prev.events : []), event] } : nextJob);
      if (event?.level === "done" || event?.level === "error") changed.current();
    });
  }, [id]);
  const shown = job && job.id === id ? job : null;

  // keep the newest log line in view
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  });

  return (
    <aside className="cds-panel" aria-label="Activity">
      <header className="cds-panel-head">
        <h2>Activity</h2>
        <button type="button" className="cds-icon" onClick={onClose} aria-label="Close activity" data-tip="Close the activity panel. Jobs keep running">
          <X size={16} strokeWidth={1.75} aria-hidden />
        </button>
      </header>
      {jobs.length ? (
        <nav className="cds-jobs" aria-label="Jobs">
          {jobs.slice(0, 8).map((j) => (
            <button key={j.id} type="button" className="cds-job" aria-current={j.id === id || undefined} data-tip={`${j.id === id ? "Shown below" : "Show its steps and log"}: ${STATE_WORD[j.state]}`} onClick={() => onFocus(j.id)}>
              <span className="cds-job-mark" data-state={j.state} aria-hidden>
                {j.state === "running" ? <LoaderCircle size={12} className="cds-spin" /> : j.state === "failed" ? <CircleAlert size={12} /> : j.state === "done" ? <Check size={12} /> : j.state === "cancelled" ? <X size={12} /> : j.app?.state === "ready" ? <GitMerge size={12} /> : <Upload size={12} />}
              </span>
              <span className="cds-job-title">{j.title}</span>
              <span className="cds-job-time">{fmtTime(j.startedAt)}</span>
            </button>
          ))}
        </nav>
      ) : (
        <p className="cds-quiet cds-pad">No jobs yet. Pulls, runs and uploads appear here with their full log.</p>
      )}
      <MergeStrip offer={merge} shownId={id} onShow={onFocus} />
      {shown ? <JobView key={`${shown.id}:${shown.staged?.length ?? 0}:${shown.staged?.filter((s) => s.conflict).length ?? 0}`} job={shown} merge={merge} logRef={logRef} onChanged={onChanged} /> : null}
    </aside>
  );
}

function JobView({ job, merge, logRef, onChanged }: { job: Job; merge: MergeOffer; logRef: React.RefObject<HTMLOListElement | null>; onChanged: () => void }) {
  const staged = job.staged ?? [];
  const [picked, setPicked] = useState<Set<string>>(() => new Set(staged.filter((s) => !s.conflict).map((s) => s.path)));
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const cardErr = useMemo(() => new Map((job.cards ?? []).map((c) => [c.card, c.errors])), [job.cards]);
  const stageId = job.stage?.split("/").pop();
  const app = job.app;
  const uploadWaiting = job.state === "awaiting-approval" && uploadPending(job);
  // what Discard would give up, in words
  const held = [
    ...(uploadWaiting ? [`${plural(staged.length, "staged kit file")} (nothing goes to Claude Design)`] : []),
    ...(app && appPending(job) ? [`branch ${app.branch} with ${plural(app.commits.length, "commit")} (nothing reaches ${app.into})`] : []),
  ];
  /** One approval action at a time; its error shows under the sections */
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="cds-jobview">
      <div className="cds-jobview-head">
        <h3>{job.title}</h3>
        <p className="cds-quiet">
          {STATE_WORD[job.state]}
          {job.progress ? ` · ${job.progress.done}/${job.progress.total} files` : ""}
          {typeof job.costUsd === "number" && job.costUsd > 0 ? ` · $${job.costUsd.toFixed(2)}` : ""}
        </p>
        {job.state === "running" ? (
          <button type="button" className="cds-link" onClick={() => void api.cancel(job.id)} data-tip="Stop this job and the process it runs">
            Stop
          </button>
        ) : null}
      </div>
      {job.progress ? <div className="cds-progress" role="progressbar" aria-valuemin={0} aria-valuemax={job.progress.total} aria-valuenow={job.progress.done}><span style={{ transform: `scaleX(${job.progress.done / Math.max(1, job.progress.total)})` }} /></div> : null}
      {job.steps.length ? (
        <ol className="cds-jobsteps">
          {job.steps.map((s) => (
            <li key={s.id} data-state={s.state}>
              <span className="cds-jobstep-mark" aria-hidden />
              <span>{s.title}</span>
              {s.summary ? <span className="cds-quiet">{s.summary}</span> : null}
            </li>
          ))}
        </ol>
      ) : null}
      {app?.state === "ready" ? (
        <section className="cds-approve" aria-labelledby="merge-h">
          <h4 id="merge-h">Merge into the App</h4>
          <p className="cds-quiet">
            The ports ran on <span className="cds-mono">{app.branch}</span>, a separate worktree from <span className="cds-mono">{app.base.slice(0, 7)}</span> on {app.into}. Every port committed, and <span className="cds-mono">{app.check?.command}</span> passed there. Nothing in your checkout changes until you merge.
          </p>
          <ul className="cds-commits" aria-label="Commits to merge">
            {app.commits.map((c) => (
              <li key={c.hash}>
                <span className="cds-mono">{c.hash}</span> {c.subject}
              </li>
            ))}
          </ul>
          <MergeButton offer={merge} place="panel" job={{ ...job, app }} />
          {merge.error ? <p className="cds-error-inline">{merge.error}</p> : null}
        </section>
      ) : null}
      {app?.state === "failed" ? (
        <section className="cds-approve" aria-labelledby="kept-h">
          <h4 id="kept-h">App branch kept for a look</h4>
          <p className="cds-error-inline">{app.reason}</p>
          <p className="cds-quiet">
            Nothing was merged. <span className="cds-mono">{app.branch}</span> ({plural(app.commits.length, "commit")}) is in <span className="cds-mono cds-break">{app.worktree}</span>. Discard removes both.
          </p>
          {app.check && !app.check.ok ? (
            <details className="cds-check-output">
              <summary data-tip="Show the last 40 lines the failed check printed">Output of {app.check.command}</summary>
              <pre>{app.check.output.trim().split("\n").slice(-40).join("\n")}</pre>
            </details>
          ) : null}
        </section>
      ) : null}
      {uploadWaiting ? (
        <section className="cds-approve" aria-labelledby="approve-h">
          <h4 id="approve-h">Upload to Claude Design</h4>
          <p className="cds-quiet">Exactly these files go up, through DesignSync with a locked plan. Nothing is deleted. Untick anything you want to leave out. Edits made in Claude Design since this run's snapshot are merged in first; a file that can't be merged isn't uploaded.</p>
          <ul className="cds-files">
            {staged.map((s) => {
              const errors = cardErr.get(s.path);
              return (
                <li key={s.path}>
                  <label data-tip={picked.has(s.path) ? "Goes up with the upload. Untick to leave it out" : "Left out of the upload. Tick to include it"}>
                    <input type="checkbox" checked={picked.has(s.path)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(s.path); else n.delete(s.path); return n; })} />
                    <span className="cds-path">{s.path}</span>
                    <span className="cds-kind">{s.status}</span>
                    {errors ? <span className={errors.length ? "cds-error-inline" : "cds-ok"}>{errors.length ? `${plural(errors.length, "error")}` : "renders"}</span> : null}
                  </label>
                  {s.conflict ? <p className="cds-error-inline cds-file-note">{s.conflict}</p> : null}
                  {/\.html$/.test(s.path) && stageId ? (
                    <button type="button" className="cds-link" data-tip={preview === s.path ? TIP.closePreview : "Render this staged file as it would look in Claude Design"} onClick={() => setPreview((p) => (p === s.path ? null : s.path))}>
                      {preview === s.path ? "Close" : "Preview"}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {preview && stageId ? <div className="cds-preview"><iframe title={`Staged ${preview}`} src={`/kit/stage/${stageId}/${preview}`} sandbox="allow-scripts allow-same-origin" /></div> : null}
          <button type="button" className="cds-btn cds-btn-primary" disabled={!picked.size || busy} data-tip={picked.size ? "Upload exactly the ticked files to Claude Design through DesignSync, then read them back" : "Tick at least one file to upload"} onClick={() => act(() => api.upload(job.id, [...picked]))}>
            <Upload size={14} strokeWidth={1.75} aria-hidden /> Upload {plural(picked.size, "file")}
          </button>
        </section>
      ) : null}
      {err ? <p className="cds-error-inline">{err}</p> : null}
      {held.length ? (
        discarding ? (
          <div className="cds-discard" role="group" aria-label="Discard this run">
            <span>Discard {held.join(" and ")}?</span>
            <button type="button" className="cds-btn" disabled={busy} data-tip="Give these up for good. Nothing reaches the App or Claude Design" onClick={() => act(() => api.discard(job.id)).then(() => setDiscarding(false))}>
              Discard
            </button>
            <button type="button" className="cds-link" data-tip="Keep everything waiting for your approval" onClick={() => setDiscarding(false)}>
              Keep
            </button>
          </div>
        ) : (
          <button type="button" className="cds-link cds-discard-open" onClick={() => setDiscarding(true)} disabled={busy} data-tip="Give up what this run left waiting for approval. Asks first">
            Discard run…
          </button>
        )
      ) : null}
      {job.result && job.state !== "running" && !(app?.state === "failed" && app.reason === job.result) ? <p className={job.state === "failed" ? "cds-error-inline" : "cds-quiet"}>{job.result}</p> : null}
      <ol ref={logRef} className="cds-log" aria-label="Log" aria-live="polite">
        {job.events.map((e, i) => (
          <li key={i} data-level={e.level}>
            <time>{new Date(e.at).toLocaleTimeString("en-GB")}</time>
            <span>{e.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

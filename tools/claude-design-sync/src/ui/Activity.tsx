// Activity: jobs with live logs. A run that staged kit files stops here for the upload approval —
// every file listed, each card's render check, previews, then one explicit Upload.
import { CircleAlert, Check, LoaderCircle, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { api, fmtTime, plural, type AppState, type Job, type JobEvent } from "./api";

const STATE_WORD: Record<Job["state"], string> = { running: "running", "awaiting-upload": "waiting for your approval", done: "done", failed: "failed", cancelled: "stopped" };

export function Activity({ state, focus, onFocus, onClose, onChanged }: { state: AppState | null; focus: string | null; onFocus: (id: string) => void; onClose: () => void; onChanged: () => void }) {
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
    let alive = true;
    const es = new EventSource(`/api/jobs/${id}/events`);
    es.addEventListener("job", (e) => alive && setJob(JSON.parse((e as MessageEvent).data) as Job));
    es.addEventListener("event", (e) => {
      if (!alive) return;
      const { job: j, event } = JSON.parse((e as MessageEvent).data) as { job: Job; event: JobEvent };
      setJob((prev) => ({ ...j, events: [...(prev?.id === j.id ? prev.events : []), event] }));
      if (event.level === "done" || event.level === "error") changed.current();
    });
    return () => {
      alive = false;
      es.close();
    };
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
        <button type="button" className="cds-icon" onClick={onClose} aria-label="Close activity">
          <X size={16} strokeWidth={1.75} aria-hidden />
        </button>
      </header>
      {jobs.length ? (
        <nav className="cds-jobs" aria-label="Jobs">
          {jobs.slice(0, 8).map((j) => (
            <button key={j.id} type="button" className="cds-job" aria-current={j.id === id || undefined} onClick={() => onFocus(j.id)}>
              <span className="cds-job-mark" data-state={j.state} aria-hidden>
                {j.state === "running" ? <LoaderCircle size={12} className="cds-spin" /> : j.state === "failed" ? <CircleAlert size={12} /> : j.state === "done" ? <Check size={12} /> : j.state === "cancelled" ? <X size={12} /> : <Upload size={12} />}
              </span>
              <span className="cds-job-title">{j.title}</span>
              <span className="cds-job-time">{fmtTime(j.startedAt)}</span>
            </button>
          ))}
        </nav>
      ) : (
        <p className="cds-quiet cds-pad">No jobs yet. Pulls, runs and uploads appear here with their full log.</p>
      )}
      {shown ? <JobView key={`${shown.id}:${shown.staged?.length ?? 0}:${shown.staged?.filter((s) => s.conflict).length ?? 0}`} job={shown} logRef={logRef} onChanged={onChanged} /> : null}
    </aside>
  );
}

function JobView({ job, logRef, onChanged }: { job: Job; logRef: React.RefObject<HTMLOListElement | null>; onChanged: () => void }) {
  const staged = job.staged ?? [];
  const [picked, setPicked] = useState<Set<string>>(() => new Set(staged.filter((s) => !s.conflict).map((s) => s.path)));
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const cardErr = useMemo(() => new Map((job.cards ?? []).map((c) => [c.card, c.errors])), [job.cards]);
  const stageId = job.stage?.split("/").pop();
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
          <button type="button" className="cds-link" onClick={() => void api.cancel(job.id)}>
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
      {job.state === "awaiting-upload" && staged.length ? (
        <section className="cds-approve" aria-labelledby="approve-h">
          <h4 id="approve-h">Upload to Claude Design</h4>
          <p className="cds-quiet">Exactly these files go up, through DesignSync with a locked plan. Nothing is deleted. Untick anything you want to leave out. Edits made in Claude Design since this run's snapshot are merged in first; a file that can't be merged isn't uploaded.</p>
          <ul className="cds-files">
            {staged.map((s) => {
              const errors = cardErr.get(s.path);
              return (
                <li key={s.path}>
                  <label>
                    <input type="checkbox" checked={picked.has(s.path)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(s.path); else n.delete(s.path); return n; })} />
                    <span className="cds-path">{s.path}</span>
                    <span className="cds-kind">{s.status}</span>
                    {errors ? <span className={errors.length ? "cds-error-inline" : "cds-ok"}>{errors.length ? `${plural(errors.length, "error")}` : "renders"}</span> : null}
                  </label>
                  {s.conflict ? <p className="cds-error-inline cds-file-note">{s.conflict}</p> : null}
                  {/\.html$/.test(s.path) && stageId ? (
                    <button type="button" className="cds-link" onClick={() => setPreview((p) => (p === s.path ? null : s.path))}>
                      {preview === s.path ? "Close" : "Preview"}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {preview && stageId ? <div className="cds-preview"><iframe title={`Staged ${preview}`} src={`/kit/stage/${stageId}/${preview}`} sandbox="allow-scripts allow-same-origin" /></div> : null}
          {err ? <p className="cds-error-inline">{err}</p> : null}
          <button
            type="button"
            className="cds-btn cds-btn-primary"
            disabled={!picked.size || busy}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                await api.upload(job.id, [...picked]);
                onChanged();
              } catch (e) {
                setErr((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Upload size={14} strokeWidth={1.75} aria-hidden /> Upload {plural(picked.size, "file")}
          </button>
          {discarding ? (
            <span className="cds-discard" role="group" aria-label="Discard this run">
              <span>Discard {plural(staged.length, "staged file")}? Nothing goes to Claude Design.</span>
              <button
                type="button"
                className="cds-btn"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api.discard(job.id);
                    onChanged();
                  } catch (e) {
                    setErr((e as Error).message);
                  } finally {
                    setBusy(false);
                    setDiscarding(false);
                  }
                }}
              >
                Discard
              </button>
              <button type="button" className="cds-link" onClick={() => setDiscarding(false)}>
                Keep
              </button>
            </span>
          ) : (
            <button type="button" className="cds-link cds-discard-open" onClick={() => setDiscarding(true)} disabled={busy}>
              Discard run…
            </button>
          )}
        </section>
      ) : null}
      {job.result && job.state !== "running" ? <p className={job.state === "failed" ? "cds-error-inline" : "cds-quiet"}>{job.result}</p> : null}
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

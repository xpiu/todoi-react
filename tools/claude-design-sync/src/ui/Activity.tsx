// Activity: jobs with live logs. A run stops here for approval: its verified App branch waits for Merge
// (commits listed), its staged kit files for Upload (every file listed, cards checked, previews; the
// upload itself runs in Claude Code, where DesignSync's prompt can be approved, and is read back here),
// and Discard gives up whatever is still waiting. A run waiting for Merge is pinned above the log even while
// another job is shown.
import { CircleAlert, Check, GitMerge, LoaderCircle, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { api, appPending, fmtTime, plural, subscribeJob, uploadPending, type AppState, type Job } from "./api";
import { CopyLink } from "./CopyLink";
import { MergeButton, MergeStrip, type MergeOffer } from "./Merge";
import { TIP } from "./Tooltip";

const STATE_WORD: Record<Job["state"], string> = { running: "running", "awaiting-approval": "waiting for your approval", done: "done", failed: "failed", cancelled: "stopped" };

export function Activity({ state, merge, focus, onFocus, onClose, onChanged }: { state: AppState | null; merge: MergeOffer; focus: string | null; onFocus: (id: string) => void; onClose: () => void; onChanged: () => void }) {
  const jobs = state?.jobs ?? [];
  const id = focus ?? jobs[0]?.id ?? null;
  const [job, setJob] = useState<Job | null>(null);
  const logRef = useRef<HTMLOListElement>(null);
  const followLog = useRef(true);
  const logJob = useRef<string | null>(null);
  const [historyLimit, setHistoryLimit] = useState(8);
  const unfinished = (j: AppState["jobs"][number]) => j.state === "running" || j.state === "awaiting-approval" || appPending(j);
  const history = jobs.filter((j) => !unfinished(j));
  const visibleIds = new Set(history.slice(0, historyLimit).map((j) => j.id));
  const visibleJobs = [...jobs.filter(unfinished), ...history.filter((j) => visibleIds.has(j.id) || j.id === id)];
  const hiddenJobs = jobs.length - visibleJobs.length;
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

  // Keep following new entries until the reader scrolls away. A different job starts at its latest entry.
  useEffect(() => {
    if (shown?.id !== logJob.current) {
      logJob.current = shown?.id ?? null;
      followLog.current = true;
    }
    const el = logRef.current;
    if (el && followLog.current) el.scrollTop = el.scrollHeight;
  }, [shown]);
  const onLogScroll = () => {
    const el = logRef.current;
    if (el) followLog.current = el.scrollHeight - el.clientHeight - el.scrollTop < 32;
  };

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
          {visibleJobs.map((j) => (
            <button key={j.id} type="button" className="cds-job" aria-current={j.id === id || undefined} data-tip={`${j.id === id ? "Shown below" : "Show its steps and log"}: ${STATE_WORD[j.state]}`} onClick={() => onFocus(j.id)}>
              <span className="cds-job-mark" data-state={j.state} aria-hidden>
                {j.state === "running" ? <LoaderCircle size={12} className="cds-spin" /> : j.state === "failed" ? <CircleAlert size={12} /> : j.state === "done" ? <Check size={12} /> : j.state === "cancelled" ? <X size={12} /> : j.app?.state === "ready" ? <GitMerge size={12} /> : <Upload size={12} />}
              </span>
              <span className="cds-job-title">{j.title}</span>
              <span className="cds-job-time">{fmtTime(j.startedAt)}</span>
            </button>
          ))}
          {hiddenJobs ? <button type="button" className="cds-link cds-job-history" data-tip="Show eight more completed or stopped jobs. Unfinished jobs always stay visible" onClick={() => setHistoryLimit((limit) => limit + 8)}>Show older jobs ({hiddenJobs})</button> : null}
        </nav>
      ) : (
        <p className="cds-quiet cds-pad">No jobs yet. Pulls, runs and uploads appear here with their full log.</p>
      )}
      <MergeStrip offer={merge} shownId={id} onShow={onFocus} />
      {shown ? <JobView key={`${shown.id}:${shown.staged?.length ?? 0}:${shown.staged?.filter((s) => s.conflict).length ?? 0}`} job={shown} merge={merge} logRef={logRef} onLogScroll={onLogScroll} onChanged={onChanged} /> : null}
    </aside>
  );
}

function JobView({ job, merge, logRef, onLogScroll, onChanged }: { job: Job; merge: MergeOffer; logRef: React.RefObject<HTMLOListElement | null>; onLogScroll: () => void; onChanged: () => void }) {
  const staged = job.staged ?? [];
  // a request already handed to Claude Code keeps its files ticked
  const [picked, setPicked] = useState<Set<string>>(() => new Set(job.handoff?.paths ?? staged.filter((s) => !s.conflict).map((s) => s.path)));
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [showRequest, setShowRequest] = useState(false);
  const cardErr = useMemo(() => new Map((job.cards ?? []).map((c) => [c.card, c.errors])), [job.cards]);
  const stageId = job.stage?.split("/").pop();
  const app = job.app;
  const uploadWaiting = job.state === "awaiting-approval" && uploadPending(job);
  // the request handed to Claude Code still names exactly the ticked files
  const handoff = job.handoff && job.handoff.paths.length === picked.size && job.handoff.paths.every((p) => picked.has(p)) ? job.handoff : null;
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
          <p className="cds-quiet">Only the ticked files go up, and nothing in Claude Design is deleted. Edits made in Claude Design since this run's snapshot are merged in first; a file that can't be merged isn't offered. The upload runs in Claude Code, where DesignSync asks you to approve it.</p>
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
          {handoff ? (
            <>
              <ol className="cds-handoff" aria-label="Upload from Claude Code">
                <li>
                  <span>
                    <strong>Copy the request</strong> and paste it into a Claude Code session in this repo, then press Enter.
                  </span>
                  <span className="cds-step-actions">
                    <CopyLink text={handoff.prompt} label="Copy request" tip="Copy the request, to paste into a Claude Code session that's already open" />
                    <button type="button" className="cds-link" aria-expanded={showRequest} data-tip={showRequest ? "Hide the request" : "Read the request Claude Code gets: two DesignSync calls, a ping back to this tool, and a report"} onClick={() => setShowRequest((s) => !s)}>
                      {showRequest ? "Hide request" : "Read request"}
                    </button>
                  </span>
                  <span className="cds-quiet">
                    No session open? <CopyLink text={handoff.command} label="Copy terminal command" tip="Copy a shell command that starts Claude Code in this repo with the request" /> and run it in a terminal instead.
                  </span>
                  {showRequest ? <pre className="cds-brief">{handoff.prompt}</pre> : null}
                </li>
                <li>
                  <span>
                    <strong>Allow the upload</strong> when Claude Code asks. Its DesignSync prompt names the staging folder <span className="cds-mono">{stageId}</span> and {handoff.paths.length === 1 ? "the file" : `the ${handoff.paths.length} files`} ticked above. In bypass-permissions mode it doesn't ask.
                  </span>
                </li>
                <li>
                  <span>
                    <strong>Read Claude Code's report.</strong> It starts with “Upload to Claude Design: SUCCEEDED” or “FAILED”, and says what to do next.
                  </span>
                </li>
                <li>
                  <span>
                    <strong>That's it when it succeeded.</strong> Claude Code tells this tool, which reads the files back from Claude Design and marks the run synced when they match. If nothing happens here, check the upload yourself:
                  </span>
                </li>
              </ol>
              <button type="button" className="cds-btn cds-btn-primary" disabled={busy} data-tip="Read the files back from Claude Design now. When every one matches its staged copy, the run is marked synced" onClick={() => act(() => api.uploadCheck(job.id))}>
                <Check size={14} strokeWidth={1.75} aria-hidden /> Check the upload
              </button>
            </>
          ) : (
            <button type="button" className="cds-btn cds-btn-primary" disabled={!picked.size || busy} data-tip={picked.size ? "Check Claude Design for newer edits to the ticked files, then get the request to paste into Claude Code, where you approve the upload - Costs tokens" : "Tick at least one file to upload"} onClick={() => act(() => api.upload(job.id, [...picked]))}>
              <Upload size={14} strokeWidth={1.75} aria-hidden /> Upload {plural(picked.size, "file")} from Claude Code
            </button>
          )}
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
      <ol ref={logRef} onScroll={onLogScroll} className="cds-log" aria-label="Log" aria-live="polite">
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

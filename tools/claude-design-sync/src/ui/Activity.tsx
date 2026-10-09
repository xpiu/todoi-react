// Activity: jobs with live logs. A run stops here for approval: its verified App branch waits for Merge
// (commits listed), its staged kit files for Upload (every file listed, cards checked, previews; the
// upload itself runs in Claude Code, where DesignSync's prompt can be approved, and is read back here),
// and Discard gives up whatever is still waiting. A run waiting for Merge is pinned above the log even while
// another job is shown.
import { CircleAlert, Check, GitMerge, LoaderCircle, Maximize2, Minimize2, Pause, Play, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { api, appPending, fmtTime, isDraft, plural, REVIEW_POINTS, subscribeJob, uploadPending, type ApiError, type AppState, type FidelityFinding, type Job } from "./api";
import { canResume, failedPorts, keepsRunFiles } from "../engine/approvals";
import { CopyLink } from "./CopyLink";
import { MergeButton, MergeStrip, type MergeOffer } from "./Merge";
import { TIP } from "./Tooltip";

const STATE_WORD: Record<Job["state"], string> = { running: "running", "awaiting-approval": "waiting for your approval", paused: "paused", done: "done", failed: "failed", cancelled: "stopped" };

export function Activity({ state, merge, focus, onFocus, wide, onToggleWide, expandedLog, onExpandLog, onClose, onChanged }: { state: AppState | null; merge: MergeOffer; focus: string | null; onFocus: (id: string) => void; wide: boolean; onToggleWide: () => void; expandedLog: boolean; onExpandLog: (expanded: boolean) => void; onClose: () => void; onChanged: () => void }) {
  const jobs = state?.jobs ?? [];
  const id = focus ?? jobs[0]?.id ?? null;
  const [job, setJob] = useState<Job | null>(null);
  const logRef = useRef<HTMLOListElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [historyLimit, setHistoryLimit] = useState(8);
  const unfinished = (j: AppState["jobs"][number]) => j.state === "running" || j.state === "awaiting-approval" || j.state === "paused" || appPending(j);
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

  const showJobs = () => {
    onExpandLog(false);
    requestAnimationFrame(() => bodyRef.current?.scrollTo({ top: 0 }));
  };
  const jumpToLog = () => {
    logRef.current?.closest(".cds-log-section")?.scrollIntoView({ block: "nearest" });
    logRef.current?.focus({ preventScroll: true });
  };

  return (
    <aside className="cds-panel" aria-label="Activity" data-log-expanded={expandedLog || undefined}>
      <header className="cds-panel-head">
        <h2>Activity</h2>
        <div className="cds-panel-actions">
          <button type="button" className="cds-link" onClick={showJobs} data-tip="Back to the list of jobs">Jobs</button>
          <button type="button" className="cds-link" onClick={jumpToLog} disabled={!shown} data-tip={shown ? "Scroll to this job's log" : "Choose a job to see its log"}>Jump to log</button>
          <button type="button" className="cds-icon cds-panel-width" onClick={onToggleWide} aria-label={wide ? "Narrow activity" : "Widen activity"} aria-pressed={wide} data-tip={wide ? "Return to the sidebar width" : "Give steps and log more room"}>
            {wide ? <Minimize2 size={16} strokeWidth={1.75} aria-hidden /> : <Maximize2 size={16} strokeWidth={1.75} aria-hidden />}
          </button>
          <button type="button" className="cds-icon" onClick={onClose} aria-label="Close activity" data-tip="Close the activity panel. Jobs keep running">
            <X size={16} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
      </header>
      <div ref={bodyRef} className="cds-panel-body" tabIndex={0} role="region" aria-label="Activity details">
        {jobs.length ? (
          <nav className="cds-jobs" aria-label="Jobs">
            {visibleJobs.map((j) => (
              <button key={j.id} type="button" className="cds-job" aria-current={j.id === id || undefined} data-tip={`${j.id === id ? "Shown below" : "Show its steps and log"}: ${STATE_WORD[j.state]}`} onClick={() => onFocus(j.id)}>
                <span className="cds-job-mark" data-state={j.state} aria-hidden>
                  {j.state === "running" ? <LoaderCircle size={12} className="cds-spin" /> : j.state === "failed" ? <CircleAlert size={12} /> : j.state === "done" ? <Check size={12} /> : j.state === "cancelled" ? <X size={12} /> : j.state === "paused" ? <Pause size={12} /> : j.app?.state === "ready" ? <GitMerge size={12} /> : <Upload size={12} />}
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
        {shown ? <JobView key={`${shown.id}:${shown.staged?.length ?? 0}:${shown.staged?.filter((s) => s.conflict).length ?? 0}`} job={shown} merge={merge} logRef={logRef} expandedLog={expandedLog} onToggleLog={() => onExpandLog(!expandedLog)} onChanged={onChanged} /> : null}
      </div>
    </aside>
  );
}

/** Who wrote a staged file, when it wasn't the AI */
const ORIGIN_WORD = { storybook: "drafted from Storybook", "storybook-refined": "drafted from Storybook, refined by Claude Code", twin: "Minimal twin, written by the tool" } as const;

/** A card's Minimal twin sorts right under its card */
const fileOrder = (p: string) => p.replace(/-minimal\.card\.html$/, ".card.html~");

/** "5 files · 1 by Claude Code · 3 drafted from Storybook · 1 Minimal twin" */
function stagedSummary(job: Job): string {
  const staged = job.staged ?? [];
  const by = (o?: string) => staged.filter((s) => job.origin?.[s.path] === o).length;
  const drafted = by("storybook") + by("storybook-refined");
  return [plural(staged.length, "file"), `${by(undefined)} by Claude Code`, drafted ? `${drafted} drafted from Storybook` : "", by("twin") ? plural(by("twin"), "Minimal twin") : ""].filter(Boolean).join(" · ");
}

const RULE_WORD: Record<FidelityFinding["rule"], string> = { "base-ui": "Base UI", forwarding: "Refs", aria: "ARIA", store: "Store", "click-target": "Click target", story: "Stories" };

const SHOWN_FINDINGS = 6;

/**
 * A port from the kit is a draft: the check proved it builds, not that it kept the App's architecture. The
 * scan's findings come first, grouped by file, each ticked once looked at; then the points every review
 * covers; then one confirmation. Merge unlocks only when all of it is ticked, so the effort grows with what
 * the scan found. Opening the run lands here.
 */
function DraftReview({ job, merge }: { job: Job & { app: NonNullable<Job["app"]> }; merge: MergeOffer }) {
  const { app } = job;
  const findings = app.review?.findings ?? [];
  const [checked, setChecked] = useState<Set<number>>(() => new Set());
  const [reviewed, setReviewed] = useState(false);
  const [all, setAll] = useState(false);
  const head = useRef<HTMLHeadingElement>(null);
  const { landing, landed } = merge;
  useEffect(() => {
    // "Review the draft" anywhere brings the developer here, once
    if (landing !== job.id) return;
    head.current?.focus({ preventScroll: true });
    head.current?.scrollIntoView({ block: "start" });
    landed();
  }, [landing, landed, job.id]);
  const range = `${app.base.slice(0, 7)}...${app.branch}`;
  const files = [...new Set(findings.map((f) => f.file))];
  const shown = all ? files : files.slice(0, SHOWN_FINDINGS);
  const open = findings.length - checked.size;
  const toggle = (i: number, on: boolean) => setChecked((s) => {
    const next = new Set(s);
    if (on) next.add(i);
    else next.delete(i);
    return next;
  });
  return (
    <div className="cds-review" role="group" aria-labelledby="review-h">
      <h5 id="review-h" ref={head} tabIndex={-1}>{findings.length ? `The architecture scan flagged ${plural(findings.length, "thing")} in ${plural(files.length, "file")}` : "The architecture scan flagged nothing"}</h5>
      {findings.length ? (
        <>
          <p className="cds-quiet">Tick each one once you've looked at it in the diff.</p>
          <ul className="cds-review-files" aria-label="Findings">
            {shown.map((file) => (
              <li key={file}>
                <span className="cds-review-file">
                  <span className="cds-mono cds-break">{file}</span>
                  <CopyLink text={`git diff ${range} -- ${file}`} label="Copy its diff" tip={`Copy “git diff ${range} -- ${file}” to read this file's draft`} />
                </span>
                <ul className="cds-review-findings">
                  {findings.map((f, i) => (f.file === file ? (
                    <li key={i}>
                      <label className="cds-check">
                        <input type="checkbox" checked={checked.has(i)} onChange={(e) => toggle(i, e.target.checked)} />
                        <span>
                          <span className="cds-review-rule">{RULE_WORD[f.rule]}</span> {f.detail}
                        </span>
                      </label>
                    </li>
                  ) : null))}
                </ul>
              </li>
            ))}
          </ul>
          {!all && files.length > SHOWN_FINDINGS ? (
            <button type="button" className="cds-link" onClick={() => setAll(true)} data-tip="List every flagged file">
              Show {plural(files.length - SHOWN_FINDINGS, "more file")}
            </button>
          ) : null}
        </>
      ) : (
        <p className="cds-quiet">The scan reads the diff for known regressions, not intent, so a clean scan still needs your eye.</p>
      )}
      <p className="cds-review-lead">Then check the whole draft for:</p>
      <ul className="cds-review-points">
        {REVIEW_POINTS.map((p) => (
          <li key={p.rule}>{p.label}</li>
        ))}
      </ul>
      <p className="cds-review-diff">
        <CopyLink text={`git diff ${range}`} label="Copy the whole diff" tip={`Copy “git diff ${range}” to read the whole draft in your terminal or editor`} />
      </p>
      <label className="cds-check" data-tip={open ? `Tick the ${plural(open, "finding")} above first` : undefined}>
        <input type="checkbox" checked={reviewed} disabled={open > 0} onChange={(e) => setReviewed(e.target.checked)} /> I reviewed this draft against these points
      </label>
      <MergeButton offer={merge} place="panel" job={job} reviewed={reviewed && !open} />
    </div>
  );
}

function JobView({ job, merge, logRef, expandedLog, onToggleLog, onChanged }: { job: Job; merge: MergeOffer; logRef: React.RefObject<HTMLOListElement | null>; expandedLog: boolean; onToggleLog: () => void; onChanged: () => void }) {
  const head = useRef<HTMLHeadingElement>(null);
  const toggleLog = () => {
    onToggleLog();
    if (expandedLog) requestAnimationFrame(() => {
      head.current?.focus({ preventScroll: true });
      head.current?.scrollIntoView({ block: "start" });
    });
  };
  const staged = job.staged ?? [];
  // a request already handed to Claude Code keeps its files ticked
  // files that need a look (render errors, a draft without its component) start unticked
  const [picked, setPicked] = useState<Set<string>>(() => new Set(job.handoff?.paths ?? staged.filter((s) => !s.conflict && !job.holdBack?.includes(s.path)).map((s) => s.path)));
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [showRequest, setShowRequest] = useState(false);
  /** Files a refused resume would set aside (an interrupted port's leftovers) */
  const [drift, setDrift] = useState<string[] | null>(null);
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
    ...(job.state === "paused" ? [[job.stage ? "its kit staging copy (nothing goes to Claude Design)" : "", app ? `branch ${app.branch} (nothing reaches ${app.into})` : ""].filter(Boolean).join(" and ") || "the paused run"] : []),
  ];
  const paused = job.state === "paused";
  const setAsideCount = app?.state === "ready" ? failedPorts(job).length : 0;
  const maxAttempts = Math.max(1, ...failedPorts(job).map((s) => s.attempts?.length ?? 1));
  const resume = (setAside: boolean) => act(async () => {
    try {
      await api.resume(job.id, setAside);
      setDrift(null);
    } catch (e) {
      const files = (e as ApiError).data?.drift;
      if (Array.isArray(files)) setDrift(files as string[]);
      throw e;
    }
  });
  /** A worktree an interrupted port left dirty gets one more choice before resuming */
  const driftChoice = (
    <>
      {drift?.length ? (
        <div className="cds-drift" role="group" aria-label="Set aside and resume">
          <p className="cds-quiet">
            {plural(drift.length, "file")} changed after the last saved step: <span className="cds-mono cds-break">{drift.slice(0, 6).join(", ")}{drift.length > 6 ? "…" : ""}</span>. Setting them aside saves them as a patch in the tool's state folder (the log names it), returns the branch to its last saved step, and resumes.
          </p>
          <button type="button" className="cds-btn" disabled={busy} data-tip="Save those changes as a patch, reset the branch to its last verified step, and resume - Costs tokens" onClick={() => void resume(true)}>
            Set aside and resume
          </button>
        </div>
      ) : null}
    </>
  );
  /** Resume, or retry set-aside features */
  const resumeControls = (label: string, pending: string) => (
    <>
      <button type="button" className="cds-btn" disabled={busy || merge.coming || !!job.steps.some((s) => s.state === "running")} data-tip="Keep the branch and every completed step; run the unfinished and failed steps again, then the final check - Costs tokens" onClick={() => void resume(false)}>
        {busy ? pending : label}
      </button>
      {driftChoice}
    </>
  );
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
      <div className="cds-job-details" hidden={expandedLog}>
        <div className="cds-jobview-head">
          <h3 ref={head} tabIndex={-1}>{job.title}</h3>
          <p className="cds-quiet">
            {STATE_WORD[job.state]}
            {job.progress ? ` · ${job.progress.done}/${job.progress.total} files` : ""}
            {typeof job.costUsd === "number" && job.costUsd > 0 ? ` · $${job.costUsd.toFixed(2)}` : ""}
          </p>
          {job.state === "running" ? (
            <span className="cds-jobview-controls">
              {job.kind === "run" ? (
                <button type="button" className="cds-link" disabled={busy || job.steps.some((s) => s.id === "upload" && s.state === "running")} onClick={() => void act(() => api.pause(job.id))} data-tip="Pause now to come back later: the running step stops and goes back to waiting, finished steps, the staging copy and the App branch are kept, and Resume goes on from here. Spends nothing while paused">
                  <Pause size={12} strokeWidth={1.75} aria-hidden /> Pause
                </button>
              ) : null}
              <button type="button" className="cds-link" onClick={() => void api.cancel(job.id)} data-tip="Stop this job and the process it runs">
                Stop
              </button>
            </span>
          ) : paused ? (
            <button type="button" className="cds-btn cds-btn-primary" disabled={busy || merge.coming} onClick={() => void resume(false)} data-tip="Go on from the paused step: finished steps are kept, the paused one runs again, then the rest - Costs tokens">
              <Play size={12} strokeWidth={1.75} aria-hidden /> {busy ? "Resuming…" : "Resume"}
            </button>
          ) : null}
        </div>
        {paused ? driftChoice : null}
        {job.progress ? <div className="cds-progress" role="progressbar" aria-valuemin={0} aria-valuemax={job.progress.total} aria-valuenow={job.progress.done}><span style={{ transform: `scaleX(${job.progress.done / Math.max(1, job.progress.total)})` }} /></div> : null}
        {job.steps.length ? (
          <ol className="cds-jobsteps">
            {job.steps.map((s) => (
              <li key={s.id} data-state={s.state}>
                <span className="cds-jobstep-mark" aria-hidden />
                <span>{s.title}</span>
                {s.summary ? <span className="cds-quiet">{s.summary}</span> : null}
                {s.setAside ? <span className="cds-quiet">Partial changes ({plural(s.setAside.files.length, "file")}) set aside{keepsRunFiles(job) ? <> in <span className="cds-mono cds-break">{s.setAside.patch}</span></> : "; the patch was deleted when the run finished"}</span> : null}
                {s.alreadyImplemented ? <details className="cds-check-output cds-port-evidence">
                  <summary>Evidence for already implemented parts</summary>
                  <ul>{s.alreadyImplemented.units.map((u) => <li key={u.id}>
                    <span className="cds-mono cds-break">{u.id}</span>
                    <ul>{u.evidence.map((e, i) => <li key={i}><span className="cds-mono cds-break">{e.path}</span>: {e.reason}</li>)}</ul>
                  </li>)}</ul>
                </details> : null}
              </li>
            ))}
          </ol>
        ) : null}
        {app?.state === "ready" ? (
          <section className="cds-approve" aria-labelledby="merge-h">
            {setAsideCount ? <div className="cds-set-aside" role="group" aria-labelledby="set-aside-h">
              <h4 id="set-aside-h">{plural(setAsideCount, "feature")} set aside</h4>
              <p className="cds-quiet">
                {setAsideCount === 1 ? "This port" : "These ports"} still failed after {plural(maxAttempts, "attempt")}, so {setAsideCount === 1 ? "its partial changes were" : "their partial changes were"} saved as a patch and the run carried on. The branch below holds only the features that passed, and the {setAsideCount === 1 ? "one" : "ones"} set aside stay open after Merge. Merge and Discard delete the {setAsideCount === 1 ? "patch" : "patches"}, so open {setAsideCount === 1 ? "it" : "them"} first if you want a look.
              </p>
              <ul className="cds-set-aside-list">{failedPorts(job).map((s) => <li key={s.id}>{s.title}</li>)}</ul>
              {resumeControls("Retry failed features", "Retrying…")}
            </div> : null}
            <h4 id="merge-h">{app.review ? "Review the draft, then merge" : "Merge into the App"}</h4>
            {app.review ? (
              <p className="cds-quiet">
                Claude Code drafted kit code into the App on <span className="cds-mono">{app.branch}</span>. <span className="cds-mono">{app.check?.command}</span> passed, so it builds and its tests pass; that doesn't show the App's architecture survived the translation. Nothing in your checkout changes until you merge.
              </p>
            ) : (
              <p className="cds-quiet">
                The ports ran on <span className="cds-mono">{app.branch}</span>, a separate worktree from <span className="cds-mono">{app.base.slice(0, 7)}</span> on {app.into}. Every port committed, and <span className="cds-mono">{app.check?.command}</span> passed there. Nothing in your checkout changes until you merge.
              </p>
            )}
            <ul className="cds-commits" aria-label="Commits to merge">
              {app.commits.map((c) => (
                <li key={c.hash}>
                  <span className="cds-mono">{c.hash}</span> {c.subject}
                </li>
              ))}
            </ul>
            {app.review ? <DraftReview key={job.id} job={{ ...job, app }} merge={merge} /> : <MergeButton offer={merge} place="panel" job={{ ...job, app }} />}
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
            {canResume(job) ? <>
              <p className="cds-quiet">Resume keeps completed steps and commits, retries unfinished steps, and runs the final check again.</p>
              {resumeControls("Resume run", "Resuming…")}
            </> : null}
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
            <p className="cds-files-sum">{stagedSummary(job)}</p>
            <ul className="cds-files">
              {[...staged].sort((a, b) => (fileOrder(a.path) < fileOrder(b.path) ? -1 : 1)).map((s) => {
                const errors = cardErr.get(s.path);
                return (
                  <li key={s.path} className={/-minimal\.card\.html$/.test(s.path) && staged.some((x) => x.path === s.path.replace(/-minimal\.card\.html$/, ".card.html")) ? "is-twin" : undefined}>
                    <label data-tip={picked.has(s.path) ? "Goes up with the upload. Untick to leave it out" : "Left out of the upload. Tick to include it"}>
                      <input type="checkbox" checked={picked.has(s.path)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(s.path); else n.delete(s.path); return n; })} />
                      <span className="cds-file-text">
                        <span className="cds-path cds-break">{s.path}</span>
                        <span className="cds-file-meta">
                          <span className="cds-kind">{s.status}</span>
                          {job.origin?.[s.path] ? <span className="cds-file-origin">· {ORIGIN_WORD[job.origin[s.path]!]}</span> : null}
                          {errors ? <span className={errors.length ? "cds-error-inline" : "cds-ok"}>{errors.length ? `${plural(errors.length, "error")}` : "renders"}</span> : null}
                        </span>
                      </span>
                    </label>
                    {/\.html$/.test(s.path) && stageId ? (
                      <button type="button" className="cds-link" data-tip={preview === s.path ? TIP.closePreview : "Render this staged file as it would look in Claude Design"} onClick={() => setPreview((p) => (p === s.path ? null : s.path))}>
                        {preview === s.path ? "Close" : "Preview"}
                      </button>
                    ) : null}
                    {s.conflict ? <p className="cds-error-inline cds-file-note">{s.conflict}</p> : null}
                    {!s.conflict && job.fileNotes?.[s.path] ? <p className="cds-error-inline cds-file-note">{job.fileNotes[s.path]}</p> : null}
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
              <button type="button" className={`cds-btn ${isDraft(job) ? "" : "cds-btn-primary"}`} disabled={!picked.size || busy} data-tip={picked.size ? "Check Claude Design for newer edits to the ticked files, then get the request to paste into Claude Code, where you approve the upload - Costs tokens" : "Tick at least one file to upload"} onClick={() => act(() => api.upload(job.id, [...picked]))}>
                <Upload size={14} strokeWidth={1.75} aria-hidden /> Upload {plural(picked.size, "file")} from Claude Code
              </button>
            )}
          </section>
        ) : null}
        {err ? <p className="cds-error-inline" role="alert">{err}</p> : null}
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
      </div>
      <JobLog job={job} logRef={logRef} expanded={expandedLog} onToggleExpanded={toggleLog} />
    </div>
  );
}

function JobLog({ job, logRef, expanded, onToggleExpanded }: { job: Job; logRef: React.RefObject<HTMLOListElement | null>; expanded: boolean; onToggleExpanded: () => void }) {
  const logText = useMemo(() => job.events.map((e) => `${e.at} [${e.level}] ${e.text}`).join("\n"), [job.events]);
  const [following, setFollowing] = useState(true);
  const followRef = useRef(true);
  const setFollow = (follow: boolean) => {
    followRef.current = follow;
    setFollowing(follow);
  };
  const latest = () => {
    setFollow(true);
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };
  // Progress updates never move a reader who has paused to inspect an earlier entry.
  useEffect(() => {
    const el = logRef.current;
    if (el && followRef.current && job.events.length) el.scrollTop = el.scrollHeight;
  }, [job.events, logRef]);
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (followRef.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [logRef]);
  return (
    <section className="cds-log-section" aria-label="Run log">
      <div className="cds-log-toolbar">
        <div className="cds-log-heading">
          <h4>Log <span className="cds-quiet">({job.events.length})</span></h4>
          <div className="cds-log-actions">
            <CopyLink text={logText} label="Copy log" tip="Copy every log entry, including timestamps" />
            <button type="button" className="cds-btn" aria-expanded={expanded} aria-controls="activity-log" onClick={onToggleExpanded} data-tip={expanded ? "Return to the run's steps" : "Give the log the whole panel"}>{expanded ? "Back to run" : "Expand log"}</button>
          </div>
        </div>
        {expanded ? <p className="cds-log-job">{job.title} · {STATE_WORD[job.state]}</p> : null}
        <div className="cds-log-navigation" role="group" aria-label="Log navigation">
          <button type="button" className="cds-link" disabled={!job.events.length} onClick={() => { setFollow(false); if (logRef.current) logRef.current.scrollTop = 0; }} data-tip={job.events.length ? "Scroll to the log's first entry" : "The log has no entries yet"}>First entry</button>
          <button type="button" className="cds-link" disabled={!job.events.length} onClick={latest} data-tip={job.events.length ? "Scroll to the newest entry" : "The log has no entries yet"}>Latest entry</button>
          <button type="button" className="cds-link" aria-pressed={following} onClick={() => following ? setFollow(false) : latest()} data-tip={following ? "Stop scrolling to new entries as they arrive" : "Keep the newest entry in view as it arrives"}>Follow live log: {following ? "on" : "off"}</button>
        </div>
      </div>
      <ol id="activity-log" ref={logRef} onScroll={() => {
        const el = logRef.current;
        if (el) setFollow(el.scrollHeight - el.clientHeight - el.scrollTop < 32);
      }} className="cds-log" aria-label="Log" aria-live={following ? "polite" : "off"} tabIndex={0}>
        {job.events.map((e, i) => (
          <li key={i} data-level={e.level}>
            <time dateTime={e.at}>{new Date(e.at).toLocaleTimeString("en-GB")}</time>
            <span>{e.text}</span>
          </li>
        ))}
        {!job.events.length ? <li className="cds-log-empty">No log entries yet. New entries will appear here.</li> : null}
      </ol>
    </section>
  );
}

// The two ways to bring Claude Design's work in: import an export (free: the download is read on this
// machine) or pull with Claude Code (costs tokens). Used on first run, on the Mapping page and on the plan.
import { Download, ExternalLink, FileArchive, FolderInput, LoaderCircle, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from "react";

import { api, archiveName, featureTally, fmtTime, isProjectArchive, plural, projectUrl, type AppState, type ArchiveChanges, type ArchiveReport, type ArchiveUsed, type Comparison, type ExportsInfo, type Imported, type SnapshotMeta } from "./api";

const CHOICE_ID = "cds-refresh";
const ENTRY_ID = "cds-refresh-open";

/** The choice inline on a page (one per page): whether it's open, and bringing it into view each time it's asked for */
export function useRefreshChoice() {
  const [open, setOpen] = useState(false);
  const [asked, setAsked] = useState(0);
  useEffect(() => {
    if (!asked) return;
    const el = document.getElementById(open ? CHOICE_ID : ENTRY_ID);
    if (open) el?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "nearest" });
    el?.focus({ preventScroll: true });
  }, [asked, open]);
  const show = useCallback(() => {
    setOpen(true);
    setAsked((n) => n + 1);
  }, []);
  const hide = useCallback(() => setOpen(false), []);
  return { open, show, hide };
}

/** The choice as a closable section above the plan's ledger or under the Mapping's refresh */
export function RefreshChoice({ choice, comparison, comparisonError, onArchiveUsed, ...props }: { choice: ReturnType<typeof useRefreshChoice>; comparison: Comparison | null; comparisonError: string | null; onArchiveUsed: (r: ArchiveUsed) => void } & Parameters<typeof DesignRefresh>[0]) {
  const archive = useArchive(props.state, comparison, onArchiveUsed);
  return (
    <>
      <section className="cds-archive-entry" aria-label="Project archive status">
        <div className="cds-archive-entry-head">
          <div>
            <strong>Update the Design snapshot</strong>
            <p>Use Claude Design's Project archive. All project files, no tokens.</p>
          </div>
          <div className="cds-archive-actions">
            {archive.newest ? <UseArchiveButton archive={archive} primary={!archive.only} /> : null}
            {!choice.open ? <button id={ENTRY_ID} type="button" className={`cds-btn ${archive.newest ? "" : "cds-btn-primary"}`} onClick={choice.show} aria-expanded={false} data-tip="Read a Project archive .zip downloaded from Claude Design. All project files, no tokens">
              <FileArchive size={14} strokeWidth={1.75} aria-hidden /> Import project archive
            </button> : null}
          </div>
        </div>
        <ArchiveStatus state={props.state} comparison={comparison} comparisonError={comparisonError} archive={archive} />
      </section>
      {choice.open ? <section className="cds-refresh" id={CHOICE_ID} tabIndex={-1} aria-labelledby="refresh-h">
        <div className="cds-refresh-head">
          <h3 id="refresh-h">Bring in Design's changes</h3>
          <button type="button" className="cds-icon" onClick={choice.hide} aria-label="Close" data-tip="Close without bringing anything in">
            <X size={14} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
        <DesignRefresh key={props.state.project.id} {...props} />
      </section> : null}
    </>
  );
}

/**
 * The newest Project archive and the one action that makes it the only Design source: it becomes Design now
 * (newer pulls and uploads set aside), Claude Design isn't asked, and the App is recompared against it.
 */
function useArchive(state: AppState, comparison: Comparison | null, onUsed: (r: ArchiveUsed) => void) {
  const base = comparison?.base?.id ?? null;
  const [report, setReport] = useState<ArchiveReport | null>(null);
  const [using, setUsing] = useState<string | null>(null);
  const [done, setDone] = useState<ArchiveUsed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  // Read again whenever the snapshots or the comparison change (an import, a recompare, an update from an archive)
  const newestSnapshot = state.snapshots[0]?.id;
  const comparedAt = comparison?.generatedAt;
  useEffect(() => {
    let live = true;
    api.archive(base).then((r) => live && setReport(r), () => {});
    return () => {
      live = false;
    };
  }, [base, newestSnapshot, comparedAt]);
  const newest = report?.archive ?? state.snapshots.find((s) => isProjectArchive(s, state.project.id)) ?? null;
  const running = state.jobs.some((j) => j.state === "running");
  // The comparison reads this archive alone: it is Design now, and its freshness wasn't taken from Claude Design
  const only = !!newest && comparison?.designSnapshot?.id === newest.id && report?.basis?.snapshot === newest.id;
  const use = async (snapshot?: SnapshotMeta) => {
    if (pending.current) return;
    pending.current = true;
    setUsing(snapshot?.id ?? newest?.id ?? "");
    setError(null);
    try {
      const r = await api.useArchive(base, snapshot?.id);
      setDone(r);
      onUsed(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      pending.current = false;
      setUsing(null);
    }
  };
  return { report, newest, only, running, using, done, error, use };
}
type ArchiveUse = ReturnType<typeof useArchive>;

function UseArchiveButton({ archive, primary }: { archive: ArchiveUse; primary: boolean }) {
  const { newest, running, using, use } = archive;
  const tip = running
    ? "A job is running. Update the comparison when it finishes"
    : `Compare the App with ${newest ? archiveName(newest) : "the archive"} alone: it becomes Design's current state on every page, newer pulls and uploads are set aside, and Claude Design isn't asked. No tokens`;
  return (
    <button type="button" className={`cds-btn ${primary ? "cds-btn-primary" : ""}`} onClick={() => void use()} disabled={!newest || running || using !== null} data-tip={tip}>
      {using === newest?.id ? <LoaderCircle size={14} className="cds-spin" aria-hidden /> : <RefreshCw size={14} strokeWidth={1.75} aria-hidden />} {using === newest?.id ? "Updating the comparison…" : "Update comparison from this archive"}
    </button>
  );
}

const sourceWord = (s: SnapshotMeta) => (s.source === "pull" ? "a Claude Code pull" : s.source === "upload" ? "an upload to Claude Design" : "an import");

/** One "what changed" line: the count, and the files behind a disclosure */
function Changes({ label, changes }: { label: ReactNode; changes: ArchiveChanges }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {changes.count ? (
          <details className="cds-archive-files">
            <summary data-tip="List the kit files that differ">{plural(changes.count, "kit file")} changed</summary>
            <ul className="cds-path">
              {changes.files.map((f) => <li key={f}>{f}</li>)}
              {changes.count > changes.files.length ? <li className="cds-quiet">and {changes.count - changes.files.length} more</li> : null}
            </ul>
          </details>
        ) : "No kit file changed"}
      </dd>
    </div>
  );
}

/** Stored imports are successful events; the comparison confirms which snapshot the app actually uses. */
function ArchiveStatus({ state, comparison, comparisonError, archive }: { state: AppState; comparison: Comparison | null; comparisonError: string | null; archive: ArchiveUse }) {
  const { report, newest, only, done } = archive;
  const current = state.snapshots[0];
  // A re-used archive is a copy of an earlier import: list it once, as its newest copy
  const origins = new Set<string>();
  const imports = state.snapshots.filter((s) => {
    if (!isProjectArchive(s, state.project.id) || origins.has(s.parent ?? s.id)) return false;
    origins.add(s.parent ?? s.id);
    return true;
  }).slice(0, 3);
  const loaded = !!current && comparison?.designSnapshot?.id === current.id && !comparisonError;
  const inUse = loaded && current?.id === newest?.id;
  const storage = current && state.snapshotRoot ? `${state.snapshotRoot}/${current.id}/files` : null;
  const newer = report?.newer?.[0];
  const freshness: Freshness = comparisonError
    ? { ok: false, text: "Loading could not be confirmed · see the error above" }
    : loaded
      ? { ok: true, text: "Loaded successfully · used for comparison" }
      : { ok: null, text: current ? "Snapshot stored · comparison not loaded yet" : "Import an archive to load its files" };
  const tally = comparison ? featureTally(comparison.features) : null;
  const headMoved = !!comparison && comparison.appHead !== state.appHead;
  return (
    <div className="cds-archive-status">
      <dl className="cds-archive-current">
        <div>
          <dt>{current?.source === "import" ? "Current archive" : "Current Design snapshot"}</dt>
          <dd>{current ? <strong>{current.source === "import" ? archiveName(current) : current.label}</strong> : "No snapshot stored yet"}</dd>
          {current ? <dd className="cds-quiet">{current.source === "import" ? `Imported ${fmtTime(current.createdAt)}` : current.source === "pull" ? "From a Claude Code pull" : "From an upload to Claude Design"} · {plural(current.fileCount, "file")}</dd> : null}
          {current?.source === "import" ? <dd className="cds-quiet">
            {current.exportedAt ? `Downloaded ${fmtTime(current.exportedAt)} (file time)` : "Download time not recorded"} · {current.projectId ? `Its manifest names ${state.project.name}` : "Its manifest names no project"}
          </dd> : null}
          {current?.archive?.path ? <dd className="cds-path">Source: {current.archive.path}</dd> : null}
          {storage ? <dd className="cds-path">Stored files: {storage}</dd> : null}
        </div>
        <div>
          <dt>Loaded in this app</dt>
          <dd><span role="status"><Fresh {...freshness} /></span></dd>
          {current?.source === "import" ? <dd className="cds-quiet">The app uses the extracted files stored above.</dd> : null}
          {newest && newer && !inUse ? <dd className="cds-archive-note">
            {archiveName(newest)} isn't used: “{newer.label}” from {sourceWord(newer)}, {fmtTime(newer.createdAt)}, is newer. Updating from the archive sets {report?.newer && report.newer.length > 1 ? `those ${report.newer.length} snapshots` : "it"} aside.
          </dd> : null}
          {newest ? <dd className="cds-quiet">
            {only ? `Design side: this archive only · Claude Design not asked · updated ${fmtTime(report?.basis?.at)}` : "Design side: the newest snapshot · not yet updated from this archive alone"}
          </dd> : null}
        </div>
      </dl>
      {comparison && tally ? (
        <p className="cds-archive-result">
          <span className="cds-archive-label">Comparison</span>
          <span>
            Compared {fmtTime(comparison.generatedAt)} with App @{comparison.appHead}
            {comparison.base ? ` since ${comparison.base.label}` : ""}: {plural(tally.app, "feature")} changed only in the App, {tally.design} only in Design, {tally.both} on both sides · {plural(comparison.counts["in-sync"] ?? 0, "part")} in sync
            {headMoved ? ` · the App moved to @${state.appHead} since, so update to include it` : ""}
          </span>
        </p>
      ) : null}
      {report?.sinceArchive || report?.sinceBase ? (
        <dl className="cds-archive-changes" aria-label="What this archive changed">
          {report.sinceArchive ? <Changes label={<>Since the previous archive <span className="cds-quiet">{archiveName(report.sinceArchive.snapshot)}, {fmtTime(report.sinceArchive.snapshot.createdAt)}</span></>} changes={report.sinceArchive} /> : null}
          {report.sinceBase ? <Changes label={<>Since sync point <span className="cds-quiet">{report.sinceBase.syncPoint.label}, {fmtTime(report.sinceBase.syncPoint.createdAt)}</span></>} changes={report.sinceBase} /> : null}
        </dl>
      ) : null}
      {done || archive.error ? (
        <p className={archive.error ? "cds-error-inline" : "cds-quiet"} role={archive.error ? "alert" : "status"}>
          {archive.error ?? `Updated ${fmtTime(done!.comparedAt)} from ${archiveName(done!.snapshot)} alone${done!.setAside.length ? `, setting aside ${plural(done!.setAside.length, "newer snapshot")}` : ""}.`}
        </p>
      ) : null}
      <div className="cds-archive-history">
        <h4>Last 3 successful archive imports</h4>
        {imports.length ? <ol aria-label="Successful archive imports">
          {imports.map((s) => {
            const used = loaded && current?.id === s.id;
            return <li key={s.id}>
              <time dateTime={s.createdAt} title={s.createdAt}>{fmtTime(s.createdAt)}</time>
              <span>{archiveName(s)}</span>
              <span className="cds-quiet">
                {plural(s.fileCount, "file")} · {used ? "In use" : "Stored"}
                {!used ? <> · <button type="button" className="cds-link" onClick={() => void archive.use(s)} disabled={archive.running || archive.using !== null} aria-label={`Update comparison from ${archiveName(s)}`} data-tip={`Compare the App with ${archiveName(s)} alone instead. No tokens`}>{archive.using === s.id ? "Updating…" : "Use"}</button></> : null}
              </span>
            </li>;
          })}
        </ol> : <p>No Project archive has been imported successfully yet.</p>}
      </div>
    </div>
  );
}

export interface Freshness {
  ok: boolean | null;
  text: string;
  fix?: { label: string; tip: string; run: () => void };
}

/** One freshness line: a 6px square (filled: current; outline: behind; faint: not known), the words, the fix */
export function Fresh({ ok, text, fix }: Freshness) {
  return (
    <span className="cds-map-fresh" data-ok={ok === null ? "unknown" : String(ok)}>
      <span className="cds-map-fresh-mark" aria-hidden />
      <span>{text}</span>
      {fix ? (
        <button type="button" className="cds-link" onClick={fix.run} data-tip={fix.tip}>
          {fix.label}
        </button>
      ) : null}
    </span>
  );
}

const mb = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const minutes = (s: number) => (s < 90 ? `${s} s` : `${Math.round(s / 60)} min`);

function coverage(covers: boolean | null, designUpdatedAt: string | null): Freshness {
  if (covers === true) return { ok: true, text: "Downloaded after Design's last change" };
  if (covers === false) return { ok: false, text: `Older than Design's last change (${fmtTime(designUpdatedAt)})` };
  return { ok: null, text: "Not compared with Design's last change yet" };
}

export function DesignRefresh({ state, onPull, onImported, pullBusy }: { state: AppState; onPull: () => void; onImported: (r: Imported) => void; pullBusy?: boolean }) {
  const [info, setInfo] = useState<ExportsInfo | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [path, setPath] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const importPending = useRef(false);
  const looking = useRef(false);
  const radios = useId();

  // Look again whenever the window comes back: the developer has likely just downloaded an export
  const look = useCallback(() => {
    if (looking.current) return;
    looking.current = true;
    api.exports().then(setInfo, () => {}).finally(() => { looking.current = false; });
  }, []);
  useEffect(() => {
    look();
    const onVisible = () => document.visibilityState === "visible" && look();
    window.addEventListener("focus", look);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", look);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [look]);

  const found = info?.exports ?? [];
  const chosen = found.find((x) => x.path === picked) ?? found[0] ?? null;
  // Keep the archive route primary, even when a fresh download is needed.
  const importFirst = !!chosen && chosen.covers !== false;
  const claudeOk = state.harnesses.claude.ok || state.fake;

  const importing = async (what: string, fn: () => Promise<Imported>) => {
    if (importPending.current) return;
    importPending.current = true;
    setBusy(what);
    setErr(null);
    try {
      onImported(await fn());
    } catch (e) {
      setErr((e as Error).message);
      look();
    } finally {
      importPending.current = false;
      setBusy(null);
    }
  };
  const importFile = (file: File | undefined) => {
    if (!file) return;
    if (!/\.zip$/i.test(file.name)) {
      setErr(`${file.name} isn't a .zip. Drop the .zip Claude Design downloads, or import an unzipped folder by its path.`);
      return;
    }
    void importing(file.name, () => api.importFile(file));
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    importFile(e.dataTransfer.files[0]);
  };
  const where = info?.folders.length ? info.folders.map((f) => f.replace(/^\/Users\/[^/]+/, "~")).join(", ") : "Downloads";

  return (
    <div className="cds-routes">
      <div className="cds-archive-heading">
        <h3>Project archive</h3>
        <span className="cds-archive-recommendation">Recommended · No tokens</span>
      </div>
      <p>Download the project's original files, then import them here to compare.</p>
      <div className="cds-archive-flow">
        <div className="cds-archive-download">
          <h4><span className="cds-map-step-n">1</span> Download from Claude Design</h4>
          <p>Open {state.project.name}, then choose:</p>
          <ol className="cds-archive-menu" aria-label="Claude Design download steps">
            <li>Share</li>
            <li>Project HTML</li>
            <li><strong>Project archive</strong></li>
            <li><strong>Export</strong></li>
          </ol>
          <p className="cds-quiet">Project archive is instant and free. Standalone HTML uses Claude and costs tokens.</p>
          <a className={`cds-btn ${importFirst ? "" : "cds-btn-primary"}`} href={projectUrl(state.project.id)} target="_blank" rel="noreferrer">
            Open Claude Design <ExternalLink size={14} strokeWidth={1.75} aria-hidden />
          </a>
        </div>
        <div
          className="cds-routes-import"
          data-drag={drag || undefined}
          onDragOver={(e) => {
            if (![...e.dataTransfer.types].includes("Files")) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setDrag(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrag(false);
          }}
          onDrop={onDrop}
        >
          <h4><span className="cds-map-step-n">2</span> Import the downloaded archive</h4>
          <p>Come back here. We'll look in {where}, or you can choose or drop a .zip.</p>

          {!info ? (
            <span className="cds-skel" aria-hidden />
          ) : found.length ? (
            <fieldset className="cds-routes-list" aria-label={`Exports of ${state.project.name} in ${where}`}>
              {found.map((x) => {
                const f = coverage(x.covers, info.designUpdatedAt);
                return (
                  <label key={x.path} className="cds-routes-file" data-picked={x === chosen || undefined}>
                    <input type="radio" name={radios} checked={x === chosen} onChange={() => setPicked(x.path)} />
                    <span className="cds-routes-file-name">{x.name}</span>
                    <span className="cds-path">
                      {x.kind === "folder" ? "unzipped folder" : mb(x.bytes)} · downloaded {fmtTime(x.modifiedAt)}
                    </span>
                    <Fresh {...f} />
                  </label>
                );
              })}
            </fieldset>
          ) : (
            <p className="cds-archive-empty">No project archive found yet. Download one using the steps on this page.</p>
          )}

          <div className="cds-routes-actions">
            {found.length ? (
              <button type="button" className={`cds-btn ${importFirst ? "cds-btn-primary" : ""}`} disabled={!chosen || !!busy} onClick={() => chosen && void importing(chosen.name, () => api.importExport(chosen.path))} data-tip={chosen ? `Read ${chosen.name} into a new snapshot and compare against it. No tokens` : "Pick an export first"}>
                <FolderInput size={14} strokeWidth={1.75} aria-hidden /> {busy && busy === chosen?.name ? "Importing…" : "Import this archive"}
              </button>
            ) : null}
            <button type="button" className="cds-btn" disabled={!!busy} onClick={() => fileInput.current?.click()} data-tip="Pick a project archive .zip from anywhere on this machine. You can also drop it on this side">
              Choose a .zip…
            </button>
            <input ref={fileInput} type="file" accept=".zip,application/zip" hidden onChange={(e) => { importFile(e.target.files?.[0]); e.target.value = ""; }} />
          </div>

          <details className="cds-routes-path">
            <summary>Import a folder by its path</summary>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void importing(path.trim(), () => api.importExport(path.trim()));
              }}
            >
              <label className="cds-field">
                <span>Path</span>
                <input value={path} onChange={(e) => setPath(e.target.value)} placeholder={`~/Downloads/${state.project.name}`} required data-tip="The folder an export unzips to, or a .zip" />
              </label>
              <button type="submit" className="cds-btn" disabled={!!busy || !path.trim()} data-tip={path.trim() ? "Read it into a new snapshot. No tokens" : "Enter a path first"}>
                {busy && busy === path.trim() ? "Importing…" : "Import"}
              </button>
            </form>
          </details>

          {busy && !found.some((x) => x.name === busy) && busy !== path.trim() ? <p className="cds-quiet" role="status">Importing {busy}…</p> : null}
          {err ? <p className="cds-error-inline" role="alert">{err}</p> : null}
          <p className="cds-routes-drop" aria-hidden>
            <FileArchive size={16} strokeWidth={1.75} /> Drop the export to import it
          </p>
        </div>
      </div>

      <details className="cds-routes-pull">
        <summary>Alternative: pull with Claude Code <span className="cds-quiet">Costs tokens</span></summary>
        <p>Claude Code reads the project in the background. Use this if you prefer an automated pull. Needs Claude Code signed in to claude.ai.</p>
        {info?.lastPull ? (
          <p className="cds-path" data-tip="What Claude Code reported for the last complete pull, at API prices. On a subscription it counts against your usage instead">
            Last pull {fmtTime(info.lastPull.at)}
            {info.lastPull.costUsd != null ? ` · $${info.lastPull.costUsd.toFixed(2)}` : ""}
            {info.lastPull.seconds != null ? ` · ${minutes(info.lastPull.seconds)}` : ""}
          </p>
        ) : null}
        <div className="cds-routes-actions">
          <button type="button" className="cds-btn" onClick={onPull} disabled={!claudeOk || pullBusy || !!busy} data-tip={pullBusy ? "A job is running. Pull when it finishes" : "Run Claude Code headless to read every text file of the project into a new snapshot. Follow it in Activity - Costs tokens"}>
            <Download size={14} strokeWidth={1.75} aria-hidden /> Pull the project
          </button>
        </div>
        {!claudeOk ? <p className="cds-error-inline">{state.harnesses.claude.error}</p> : null}
      </details>
    </div>
  );
}

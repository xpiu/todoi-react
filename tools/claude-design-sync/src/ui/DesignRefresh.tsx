// The two ways to bring Claude Design's work in: import an export (free: the download is read on this
// machine) or pull with Claude Code (costs tokens). Used on first run, on the Mapping page and on the plan.
import { Download, ExternalLink, FileArchive, FolderInput, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type DragEvent } from "react";

import { api, fmtTime, projectUrl, type AppState, type ExportsInfo, type Imported } from "./api";

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
export function RefreshChoice({ choice, ...props }: { choice: ReturnType<typeof useRefreshChoice> } & Parameters<typeof DesignRefresh>[0]) {
  if (!choice.open) return (
    <div className="cds-archive-entry">
      <div>
        <strong>Update the Design snapshot</strong>
        <p>Use Claude Design's Project archive. All project files, no tokens.</p>
      </div>
      <button id={ENTRY_ID} type="button" className="cds-btn cds-btn-primary" onClick={choice.show} aria-expanded={false}>
        <FileArchive size={14} strokeWidth={1.75} aria-hidden /> Import project archive
      </button>
    </div>
  );
  return (
    <section className="cds-refresh" id={CHOICE_ID} tabIndex={-1} aria-labelledby="refresh-h">
      <div className="cds-refresh-head">
        <h3 id="refresh-h">Bring in Design's changes</h3>
        <button type="button" className="cds-icon" onClick={choice.hide} aria-label="Close" data-tip="Close without bringing anything in">
          <X size={14} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
      <DesignRefresh key={props.state.project.id} {...props} />
    </section>
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

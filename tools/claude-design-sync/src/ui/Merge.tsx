// The one Merge action, offered wherever the eye lands: the navbar, a banner on the page, the plan bar and
// the activity panel. All of them share one hook, so they agree and one press disables them all. Each is
// filled ink while a verified App branch waits, greyed out while a run is still porting into the App, and
// absent otherwise.
import { GitMerge } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { api, plural, subscribeJob, type AppState, type Job } from "./api";

type ListedJob = AppState["jobs"][number];
type ReadyJob = ListedJob & { app: NonNullable<Job["app"]> };

export interface MergeOffer {
  /** The newest run whose App branch passed its check and waits for Merge */
  ready: ReadyJob | null;
  /** How many runs wait for Merge */
  waiting: number;
  /** A run is still porting into the App: Merge will be offered when its check passes */
  coming: boolean;
  busy: boolean;
  error: string | null;
  merge: (jobId?: string) => Promise<void>;
}

/**
 * What waits for Merge, kept live: while a job runs, its end refreshes the state (`onSettled`), so the
 * offer appears the moment a run's check passes, even with the activity panel closed.
 */
export function useMerge(state: AppState | null, onSettled: () => void, onMerged: () => void): MergeOffer {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settled = useRef(onSettled);
  useEffect(() => {
    settled.current = onSettled;
  });

  const jobs = state?.jobs ?? [];
  const readyJobs = jobs.filter((j): j is ReadyJob => j.app?.state === "ready");
  const live = jobs.find((j) => j.state === "running")?.id;
  useEffect(() => {
    if (!live) return;
    return subscribeJob(live, (j) => {
      if (j.state !== "running") settled.current();
    });
  }, [live]);

  const merge = async (jobId = readyJobs[0]?.id) => {
    if (!jobId) return;
    setBusy(true);
    setError(null);
    try {
      await api.merge(jobId);
      onMerged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return {
    ready: readyJobs[0] ?? null,
    waiting: readyJobs.length,
    coming: jobs.some((j) => j.state === "running" && j.app?.state === "working"),
    busy,
    error,
    merge,
  };
}

const what = (j: ReadyJob) => `${plural(j.app.commits.length, "commit")} into ${j.app.into}`;
const commitLines = (j: ReadyJob) => j.app.commits.map((c) => `${c.hash} ${c.subject}`).join("\n");

/**
 * The Merge button in one of its places. `job` pins it to one run (the panel's job view); otherwise it
 * merges the newest waiting run.
 */
export function MergeButton({ offer, place, job }: { offer: MergeOffer; place: "bar" | "plan" | "banner" | "panel"; job?: ReadyJob }) {
  const target = job ?? offer.ready;
  if (!target) {
    // greyed out only where it's a standing control; the banner and panel simply don't show
    if (!offer.coming || place === "banner" || place === "panel") return null;
    const tip = "A run is still porting into the App. Merge lights up here once its check passes";
    return place === "bar" ? (
      <button type="button" className="cds-tool cds-merge-bar" disabled aria-label="Merge (a run is still porting)" data-tip={tip}>
        <GitMerge size={14} strokeWidth={1.75} aria-hidden /> <span className="cds-tool-label">Merge</span>
      </button>
    ) : (
      <button type="button" className="cds-btn" disabled data-tip={tip}>
        <GitMerge size={14} strokeWidth={1.75} aria-hidden /> Merge
      </button>
    );
  }
  const more = !job && offer.waiting > 1 ? `\n${plural(offer.waiting - 1, "more run")} wait${offer.waiting === 2 ? "s" : ""} after this one.` : "";
  const tip = `Merge ${target.app.branch} into ${target.app.into} in your checkout. Its ${target.app.check?.command ?? "check"} passed:\n${commitLines(target)}${more}`;
  const press = () => void offer.merge(target.id);
  if (place === "bar")
    return (
      <button type="button" className="cds-tool cds-merge-bar is-ready" disabled={offer.busy} aria-label={`Merge ${what(target)}`} data-tip={tip} onClick={press}>
        <GitMerge size={14} strokeWidth={2} aria-hidden /> <span className="cds-tool-label">{offer.busy ? "Merging…" : `Merge into ${target.app.into}`}</span>
        {offer.waiting > 1 && !job ? <span className="cds-merge-count">{offer.waiting}</span> : null}
      </button>
    );
  return (
    <button type="button" className="cds-btn cds-btn-primary" disabled={offer.busy} data-tip={tip} onClick={press}>
      <GitMerge size={14} strokeWidth={1.75} aria-hidden /> {offer.busy ? "Merging…" : `Merge ${what(target)}`}
    </button>
  );
}

/** The page's own announcement while a run waits for Merge; `onReview` opens it in Activity (else a link there) */
export function MergeBanner({ offer, onReview }: { offer: MergeOffer; onReview?: (jobId: string) => void }) {
  const j = offer.ready;
  if (!j) return null;
  return (
    <section className="cds-merge-banner" aria-labelledby="merge-banner-h">
      <div className="cds-merge-banner-text">
        <h2 id="merge-banner-h">
          {offer.waiting > 1 ? `${offer.waiting} runs wait for your merge` : `“${j.title}” waits for your merge`}
        </h2>
        <p className="cds-quiet">
          {plural(j.app.commits.length, "commit")} on <span className="cds-mono">{j.app.branch}</span> passed <span className="cds-mono">{j.app.check?.command}</span>. Nothing reaches {j.app.into} until you merge.
        </p>
        <ul className="cds-commits" aria-label="Commits to merge">
          {j.app.commits.map((c) => (
            <li key={c.hash}>
              <span className="cds-mono">{c.hash}</span> {c.subject}
            </li>
          ))}
        </ul>
        {offer.error ? <p className="cds-error-inline">{offer.error}</p> : null}
      </div>
      <div className="cds-merge-banner-actions">
        <MergeButton offer={offer} place="banner" />
        {onReview ? (
          <button type="button" className="cds-link" onClick={() => onReview(j.id)} data-tip="Open this run in Activity: its steps, check output, log, and Discard">
            Review in Activity
          </button>
        ) : (
          <a className="cds-link" href={`/?job=${encodeURIComponent(j.id)}`} data-tip="Open this run in Activity on the plan page: its steps, check output, log, and Discard">
            Review in Activity
          </a>
        )}
      </div>
    </section>
  );
}

/** The panel's reminder while the job shown below isn't the one waiting */
export function MergeStrip({ offer, shownId, onShow }: { offer: MergeOffer; shownId: string | null; onShow: (jobId: string) => void }) {
  const j = offer.ready;
  if (!j || j.id === shownId) return null;
  return (
    <div className="cds-merge-strip" role="group" aria-label="Waiting for your merge">
      <span>
        <button type="button" className="cds-link" onClick={() => onShow(j.id)} data-tip="Show this run below: its commits, check and log">
          {j.title}
        </button>{" "}
        waits for your merge
      </span>
      <MergeButton offer={offer} place="panel" />
    </div>
  );
}

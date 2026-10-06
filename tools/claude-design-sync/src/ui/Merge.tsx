// The one Merge action, offered wherever the eye lands: the navbar, a banner on the page, the plan bar and
// the activity panel. All of them share one hook, so they agree and one press disables them all. Each is
// filled ink while a verified App branch waits, greyed out while a run is still porting into the App, and
// absent otherwise. A draft (kit code ported into the App) is reviewed in one place, Activity, so every
// other Merge offers "Review the draft" and opens it there.
import { GitMerge, ScanSearch } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { api, isDraft, plural, subscribeJob, type AppState, type Job } from "./api";

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
  /** `reviewed`: the developer confirmed their review of a draft */
  merge: (jobId?: string, reviewed?: boolean) => Promise<void>;
  /** Open a draft's review in Activity */
  review: (jobId: string) => void;
  /** The draft whose review was just asked for: its review takes focus once, then calls `landed` */
  landing: string | null;
  landed: () => void;
}

/**
 * What waits for Merge, kept live: while a job runs, its end refreshes the state (`onSettled`), so the
 * offer appears the moment a run's check passes, even with the activity panel closed.
 */
export function useMerge(state: AppState | null, onSettled: () => void, onMerged: () => void, onReview: (jobId: string) => void = (id) => window.location.assign(`/?job=${encodeURIComponent(id)}&review=1`)): MergeOffer {
  const [busy, setBusy] = useState(false);
  // another page sends a review here as ?job=<id>&review=1
  const [landing, setLanding] = useState<string | null>(() => {
    const q = new URLSearchParams(window.location.search);
    return q.get("review") ? q.get("job") : null;
  });
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

  const merge = async (jobId = readyJobs[0]?.id, reviewed = false) => {
    if (!jobId) return;
    setBusy(true);
    setError(null);
    try {
      await api.merge(jobId, reviewed);
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
    review: (id) => {
      setLanding(id);
      onReview(id);
    },
    landing,
    landed: () => setLanding(null),
  };
}

const what = (j: ReadyJob) => `${plural(j.app.commits.length, "commit")} into ${j.app.into}`;
const commitLines = (j: ReadyJob) => j.app.commits.map((c) => `${c.hash} ${c.subject}`).join("\n");

/**
 * The Merge button in one of its places. `job` pins it to one run (the panel's job view); otherwise it
 * merges the newest waiting run. A draft merges only from the panel, once `reviewed`; elsewhere its button
 * opens the review.
 */
export function MergeButton({ offer, place, job, reviewed = false }: { offer: MergeOffer; place: "bar" | "plan" | "banner" | "panel"; job?: ReadyJob; reviewed?: boolean }) {
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
  if (isDraft(target) && place !== "panel") {
    const found = target.app.review!.findings.length;
    const why = `${target.app.branch} holds kit code Claude Code ported into the App. ${target.app.check?.command ?? "The check"} passed, which doesn't prove it kept Base UI, refs, store selectors or accessibility${found ? `; the scan flagged ${plural(found, "thing")}` : ""}. Review it in Activity, then merge there${more}`;
    const open = () => offer.review(target.id);
    return place === "bar" ? (
      <button type="button" className="cds-tool cds-merge-bar is-ready" aria-label={`Review the draft: ${what(target)}`} data-tip={why} onClick={open}>
        <ScanSearch size={14} strokeWidth={2} aria-hidden /> <span className="cds-tool-label">Review the draft</span>
        {offer.waiting > 1 && !job ? <span className="cds-merge-count">{offer.waiting}</span> : null}
      </button>
    ) : (
      <button type="button" className={`cds-btn ${place === "banner" || place === "plan" ? "cds-btn-primary" : ""}`} data-tip={why} onClick={open}>
        <ScanSearch size={14} strokeWidth={1.75} aria-hidden /> Review the draft
      </button>
    );
  }
  const unreviewed = isDraft(target) && !reviewed;
  const tip = unreviewed ? "Tick the findings and “I reviewed this draft” above first: it is kit code drafted by AI, and the check can't see architecture" : `Merge ${target.app.branch} into ${target.app.into} in your checkout. Its ${target.app.check?.command ?? "check"} passed:\n${commitLines(target)}${more}`;
  const press = () => void offer.merge(target.id, isDraft(target) && reviewed);
  if (place === "bar")
    return (
      <button type="button" className="cds-tool cds-merge-bar is-ready" disabled={offer.busy} aria-label={`Merge ${what(target)}`} data-tip={tip} onClick={press}>
        <GitMerge size={14} strokeWidth={2} aria-hidden /> <span className="cds-tool-label">{offer.busy ? "Merging…" : `Merge into ${target.app.into}`}</span>
        {offer.waiting > 1 && !job ? <span className="cds-merge-count">{offer.waiting}</span> : null}
      </button>
    );
  return (
    <button type="button" className="cds-btn cds-btn-primary" disabled={offer.busy || unreviewed} data-tip={tip} onClick={press}>
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
          {offer.waiting > 1 ? `${offer.waiting} runs wait for your merge` : isDraft(j) ? `“${j.title}” is a draft waiting for your review` : `“${j.title}” waits for your merge`}
        </h2>
        <p className="cds-quiet">
          {plural(j.app.commits.length, "commit")} on <span className="cds-mono">{j.app.branch}</span> passed <span className="cds-mono">{j.app.check?.command}</span>.{" "}
          {isDraft(j) ? `It is kit code ported by AI, so it merges after you review it${j.app.review!.findings.length ? `; the architecture scan flagged ${plural(j.app.review!.findings.length, "thing")}` : ""}.` : `Nothing reaches ${j.app.into} until you merge.`}
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
        {isDraft(j) ? null : onReview ? (
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

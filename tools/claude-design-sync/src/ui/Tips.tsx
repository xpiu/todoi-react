// The page's closing note: how to keep a large sync reviewable. Each tip names the control that does it, and
// the one action (untick everything, to pick a first batch) sits beside them.
import { ListChecks } from "lucide-react";

const TIPS: Array<{ title: string; text: string }> = [
  { title: "Skip what the other side can't use.", text: "Data, persistence and tooling changes rarely have anything to show in the kit, and kit explorations rarely belong in the App. Set them to Skip (⊘) so they don't become AI ports nobody needs." },
  { title: "Sync in small batches.", text: "Pick a few related features at a time: small shared components first, then the views built from them, then overlays and flows. A small batch is quick to review and quick to undo." },
  { title: "Look at what depends on the change.", text: "After each batch lands, open the screens and cards on the receiving side that use the changed components, and check them by eye before the next batch. The tool only test-renders the cards it changed itself." },
  { title: "Compare the big components visually.", text: "Before you approve, use Compare visually on the largest or most-used components in the batch, to see the App's story beside the kit's card." },
];

export function Tips({ onStartBatch, canStart }: { onStartBatch: () => void; canStart: boolean }) {
  return (
    <section className="cds-tips" aria-labelledby="tips-h">
      <div className="cds-tips-head">
        <h2 id="tips-h">Before a large sync</h2>
        <p className="cds-quiet">Many changed features at once are hard to review. These habits keep each run small enough to check.</p>
      </div>
      <ol className="cds-tips-list">
        {TIPS.map((t) => (
          <li key={t.title}>
            <strong>{t.title}</strong> {t.text}
          </li>
        ))}
      </ol>
      <div className="cds-tips-cta">
        <button type="button" className="cds-btn" onClick={onStartBatch} disabled={!canStart} data-tip={canStart ? "Untick every feature and go to the list, to tick just the first batch" : "No features to pick from"}>
          <ListChecks size={14} strokeWidth={1.75} aria-hidden /> Pick a first batch
        </button>
      </div>
    </section>
  );
}

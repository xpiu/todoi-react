// The log heading's token meter: what this job's Claude Code calls have used, very roughly. While the job runs
// it counts up as the calls stream (tokens priced at list rates); each call's own reported cost replaces its
// estimate when it ends. Afterwards it keeps the total with the time of the last usage.
import { useEffect, useRef, useState } from "react";

import type { Job } from "./api";

const fmtTokens = (n: number) => (n < 1000 ? String(Math.round(n)) : n < 1_000_000 ? `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k` : `${(n / 1_000_000).toFixed(2)}M`);
const fmtUsd = (n: number) => `$${n < 10 ? n.toFixed(2) : n.toFixed(1)}`;
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const full = (n: number) => Math.round(n).toLocaleString("en-GB");

/** A number that runs up to its new value instead of jumping, so the live meter reads as a counter */
function useCountUp(target: number, ms = 600): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const begin = from.current;
    if (begin === target || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      from.current = target;
      setShown(target);
      return;
    }
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const value = begin + (target - begin) * (1 - (1 - t) ** 3);
      from.current = value;
      setShown(value);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, ms]);
  return shown;
}

export function UsageMeter({ job }: { job: Job }) {
  const u = job.usage;
  const live = job.state === "running";
  const tokens = u ? u.input + u.output + u.cacheRead + u.cacheWrite : 0;
  // jobs from before the meter only know what Claude Code reported
  const usd = u?.usd ?? job.costUsd ?? 0;
  const shownUsd = useCountUp(usd);
  const shownTokens = useCountUp(tokens);
  if (!live && !u && !job.costUsd) return null;
  const rough = !!u && u.estimatedUsd > 0.005;
  const at = u?.at ?? job.endedAt;
  const tip = [
    live ? "Token meter for this job, very rough: it counts up while Claude Code works." : `Token meter for this job: what its Claude Code calls used${at ? `, last at ${new Date(at).toLocaleTimeString("en-GB")}` : ""}.`,
    u ? `Input ${full(u.input)} · output ${full(u.output)} · cache read ${full(u.cacheRead)} · cache write ${full(u.cacheWrite)} tokens.` : "Token counts weren't recorded for this job; the cost is what Claude Code reported.",
    u ? `${fmtUsd(u.usd - u.estimatedUsd)} reported by Claude Code for finished calls${u.estimatedUsd > 0 ? `; about ${fmtUsd(u.estimatedUsd)} estimated from list prices for ${live ? "the call still running" : "calls that stopped before reporting"}` : ""}.` : null,
    "Output is counted as it streams, before thinking tokens, so a running estimate errs low until the call reports.",
  ].filter(Boolean).join("\n");
  const label = live ? `Spending now: about ${fmtUsd(usd)}, ${fmtTokens(tokens)} tokens` : `Spent ${rough ? "about " : ""}${fmtUsd(usd)}${u ? `, ${fmtTokens(tokens)} tokens` : ""}${at ? `, last at ${clock(at)}` : ""}`;
  return (
    <span className={`cds-usage ${live ? "is-live" : ""}`} role="img" tabIndex={0} aria-label={label} data-tip={tip}>
      {live ? <span className="cds-usage-dot" aria-hidden /> : null}
      <span aria-hidden>{live || rough ? "≈ " : ""}{fmtUsd(shownUsd)}</span>
      {u || live ? <span aria-hidden>· {fmtTokens(shownTokens)} tok</span> : null}
      {!live && at ? <time aria-hidden dateTime={at}>· {clock(at)}</time> : null}
    </span>
  );
}

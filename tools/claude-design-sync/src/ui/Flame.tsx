// The token meter in the bar: a flame drawn like the bar's other icons while nothing spends tokens, lit
// and flickering while the server runs Claude Code (a pull, Check for changes, an AI port, an upload's
// checks). It follows the server's own count of live calls (polled: every second while lit, so the tip's
// clock ticks, every two otherwise, never while the tab is hidden).
import { useEffect, useState } from "react";

import { api, plural, type MeterState } from "./api";

/** Lucide's flame, so the unlit meter reads as one of the bar's icons */
const FLAME = "M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z";
/** The open heart near the base */
const CORE = "M12 21.2a3.2 3.2 0 0 1-3.2-3.2c0-1.5 1-2.5 1.8-3.4.6-.7 1.1-1.5 1.3-2.6 1.4 1 3.3 3 3.3 5.9a3.2 3.2 0 0 1-3.2 3.3z";

const WHAT_BURNS = "It burns while this tool runs Claude Code for you: Pull, Check for changes, AI ports either way, and an upload's checks. Each of those spends tokens.";
const FREE = "Recompare, plans, previews and Compare visually run on this machine and cost nothing. An upload you paste into Claude Code spends there, outside this meter.";

const elapsed = (since: string, now: number) => {
  const s = Math.max(0, Math.round((now - Date.parse(since)) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
};

/** `undefined`: not asked yet; `null`: the server didn't answer */
function tipFor(m: MeterState | null | undefined, now: number): string {
  if (m === undefined) return "Token meter: asking the server what's running…";
  if (!m) return "Token meter: the server can't be reached, so it can't tell what's running.";
  const head = m.burning.length
    ? ["Spending tokens now:", ...m.burning.map((b) => `• ${b.what}, ${elapsed(b.since, now)}`)].join("\n")
    : "Token meter: nothing is spending tokens now.";
  const spent = m.calls ? `Since the server started: ${plural(m.calls, "Claude Code call")}, about $${m.spentUsd.toFixed(2)} as Claude Code reports it.` : null;
  return [head, WHAT_BURNS, FREE, spent].filter(Boolean).join("\n\n");
}

export function Flame() {
  const [meter, setMeter] = useState<MeterState | null | undefined>(undefined);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer = 0;
    let stopped = false;
    let busy = false;
    const poll = async () => {
      window.clearTimeout(timer);
      if (stopped || busy || document.hidden) return;
      busy = true;
      const m = await api.meter().catch(() => null);
      busy = false;
      if (stopped) return;
      setMeter(m);
      setNow(Date.now());
      timer = window.setTimeout(poll, m?.burning.length ? 1000 : 2000);
    };
    document.addEventListener("visibilitychange", poll);
    void poll();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, []);
  const burning = meter?.burning.length ?? 0;

  const label = burning ? `Token meter: spending tokens, ${plural(burning, "Claude Code call")} running` : "Token meter: not spending tokens";
  return (
    <>
      <span className={`cds-flame ${burning ? "is-burning" : ""}`} role="img" tabIndex={0} aria-label={label} data-tip={tipFor(meter, now)}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
          <path className="cds-flame-outline" d={FLAME} />
          <g className="cds-flame-lit">
            <g className="cds-flame-sway">
              <path d={FLAME} fill="var(--label-orange)" />
              <path className="cds-flame-core" d={CORE} />
            </g>
          </g>
        </svg>
      </span>
      <span className="cds-sr" aria-live="polite">
        {burning ? "Claude Code is spending tokens" : ""}
      </span>
    </>
  );
}

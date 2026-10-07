// The bar every page shares: the wordmark, Merge while a run waits for it, the page's own tools, the pages
// (Plan, Mapping, Guide), the token meter (Flame.tsx) beside the mode toggle, and the Claude Design project
// the tool targets.
import { ArrowLeftRight, ArrowUpRight, BookOpen, ListChecks, Moon, Sun, Waypoints } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { projectUrl, store, type AppState } from "./api";
import { Flame } from "./Flame";
import { MergeButton, type MergeOffer } from "./Merge";
import { TIP } from "./Tooltip";

const PAGES = [
  { id: "plan", href: "/", label: "Plan", Icon: ListChecks, tip: "The sync plan: what changed on each side, and which way to move it" },
  { id: "mapping", href: "/mapping", label: "Mapping", Icon: Waypoints, tip: "How App files pair with Design files, lane by lane, and what moved lately" },
  { id: "guide", href: "/guide", label: "Guide", Icon: BookOpen, tip: "What /design-sync does, how it differs from this app, and sources for the walkthrough" },
] as const;

export function TopBar({ state, page, merge, children }: { state: AppState | null; page: (typeof PAGES)[number]["id"]; merge?: MergeOffer; children?: ReactNode }) {
  const [mode, setMode] = useState(() => document.documentElement.dataset.mode === "dark" ? "dark" : "light");
  const manual = useRef(false);

  useEffect(() => {
    const saved = store.get<unknown>("cds-mode", null);
    manual.current = saved === "light" || saved === "dark";
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const followSystem = () => {
      if (manual.current) return;
      const next = media.matches ? "dark" : "light";
      document.documentElement.dataset.mode = next;
      setMode(next);
    };
    media.addEventListener("change", followSystem);
    return () => media.removeEventListener("change", followSystem);
  }, []);

  const toggleMode = () => {
    const next = mode === "dark" ? "light" : "dark";
    manual.current = true;
    document.documentElement.dataset.mode = next;
    setMode(next);
    store.set("cds-mode", next);
  };
  const modeLabel = `Switch to ${mode === "dark" ? "light" : "dark"} mode`;

  return (
    <header className="cds-bar">
      <h1 className="cds-wordmark">
        <ArrowLeftRight size={14} strokeWidth={1.75} className="cds-wordmark-mark" aria-hidden />
        <span className="cds-wordmark-name">Claude Design sync tool</span>
      </h1>
      {/* three groups, ruled apart: this page's own tools, the pages, then the meter, mode and project */}
      <div className="cds-bar-group cds-bar-tools">
        {merge ? <MergeButton offer={merge} place="bar" /> : null}
        {children}
      </div>
      <nav className="cds-bar-group cds-pages" aria-label="Pages">
        {PAGES.map(({ id, href, label, Icon, tip }) => (
          <a key={id} className="cds-tool cds-page" href={href} aria-current={page === id ? "page" : undefined} aria-label={label} data-tip={tip}>
            <Icon size={14} strokeWidth={1.75} aria-hidden /> <span className="cds-page-label">{label}</span>
          </a>
        ))}
      </nav>
      <div className="cds-bar-group cds-bar-meta">
        <Flame />
        <button type="button" className="cds-tool cds-mode-toggle" onClick={toggleMode} aria-label={modeLabel} data-tip={modeLabel}>
          {mode === "dark" ? <Sun size={14} strokeWidth={1.75} aria-hidden /> : <Moon size={14} strokeWidth={1.75} aria-hidden />}
        </button>
        <a className="cds-tool" href={state ? projectUrl(state.project.id) : "https://claude.ai/design"} target="_blank" rel="noreferrer" aria-label={`${state?.project.name ?? "Claude Design"} in Claude Design (opens in a new tab)`} data-tip={TIP.project}>
          <ArrowUpRight size={14} strokeWidth={1.75} aria-hidden /> <span className="cds-tool-label">Claude Design</span>
        </a>
      </div>
    </header>
  );
}

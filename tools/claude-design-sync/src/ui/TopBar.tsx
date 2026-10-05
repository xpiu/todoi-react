// The bar every page shares: the wordmark, the page's own tools, the pages (Plan, Mapping), and the
// Claude Design project the tool targets.
import { ArrowLeftRight, ArrowUpRight, ListChecks, Waypoints } from "lucide-react";
import type { ReactNode } from "react";

import { projectUrl, type AppState } from "./api";

const PAGES = [
  { id: "plan", href: "/", label: "Plan", Icon: ListChecks },
  { id: "mapping", href: "/mapping", label: "Mapping", Icon: Waypoints },
] as const;

export function TopBar({ state, page, children }: { state: AppState | null; page: (typeof PAGES)[number]["id"]; children?: ReactNode }) {
  return (
    <header className="cds-bar">
      <h1 className="cds-wordmark">
        <ArrowLeftRight size={14} strokeWidth={1.75} className="cds-wordmark-mark" aria-hidden />
        <span className="cds-wordmark-name">Claude Design sync tool</span>
      </h1>
      <div className="cds-bar-tools">
        {children}
        <nav className="cds-pages" aria-label="Pages">
          {PAGES.map(({ id, href, label, Icon }) => (
            <a key={id} className="cds-tool" href={href} aria-current={page === id ? "page" : undefined} aria-label={label}>
              <Icon size={14} strokeWidth={1.75} aria-hidden /> <span className="cds-tool-label">{label}</span>
            </a>
          ))}
        </nav>
        <a className="cds-tool" href={state ? projectUrl(state.project.id) : "https://claude.ai/design"} target="_blank" rel="noreferrer" aria-label={`${state?.project.name ?? "Claude Design"} in Claude Design (opens in a new tab)`}>
          <ArrowUpRight size={14} strokeWidth={1.75} aria-hidden /> <span className="cds-tool-label">Claude Design</span>
        </a>
      </div>
    </header>
  );
}

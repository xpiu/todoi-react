// Skeleton + ViewSkeleton — loading placeholders (DESIGN.md › States). ViewSkeleton renders nothing for
// the first `delay` ms so fast loads never flash; no minimum display time, no spinner on the canvas.
import { useEffect, useState, type CSSProperties } from "react";

import "./Skeleton.css";
import "./text.css";

export interface SkeletonProps {
  /** @default "100%" */
  width?: number | string;
  /** @default 12 */
  height?: number | string;
  /** Circle / pill — avatars, checkboxes, list glyphs */
  round?: boolean;
  style?: CSSProperties;
  className?: string;
}

export function Skeleton({ width = "100%", height = 12, round, style, className }: SkeletonProps) {
  return <span className={["td-sk", round ? "td-sk-round" : "", className ?? ""].filter(Boolean).join(" ")} aria-hidden style={{ width, height, ...style }} />;
}

// Deterministic shapes so the placeholder is stable across renders (no randomness, no layout jump).
const BOARD = [[1, 2, 1], [2, 1], [1, 1, 2, 1]];
const ROWS = [[72, 54, 88, 64, 46], [60, 80, 52], [68, 44, 76, 58]];
const HEAD_WIDTHS = [96, 72, 120];
const TITLE_WIDTHS = ["78%", "56%", "66%"];
const SECTION_WIDTHS = [110, 84, 132];

function BoardSkeleton({ lists }: { lists: number }) {
  return (
    <div className="td-skview-board">
      {Array.from({ length: lists }, (_, c) => {
        const cards = BOARD[c % BOARD.length]!;
        return (
          <div key={c} className="td-sk-col">
            <div className="td-sk-colhead">
              <Skeleton width={16} height={16} round />
              <Skeleton width={HEAD_WIDTHS[c % 3]} height={12} />
            </div>
            {cards.map((lines, i) => (
              <div key={i} className="td-sk-card">
                <Skeleton width={lines > 1 ? "92%" : TITLE_WIDTHS[i % 3]} height={12} />
                {lines > 1 ? <Skeleton width="48%" height={12} /> : null}
                <div className="td-sk-cardmeta">
                  <Skeleton width={44} height={10} />
                  <Skeleton width={20} height={10} />
                </div>
              </div>
            ))}
            <div className="td-sk-colfoot" />
          </div>
        );
      })}
    </div>
  );
}

function ListSkeleton({ lists, header = true, rows }: { lists: number; header?: boolean; rows?: number[] }) {
  return (
    <div className="td-skview-list">
      <div className="td-skview-list-inner">
        {Array.from({ length: lists }, (_, s) => {
          const ws = rows ?? ROWS[s % ROWS.length]!;
          return (
            <div key={s} className="td-sk-sec">
              {header ? (
                <div className="td-sk-sechead">
                  <Skeleton width={18} height={18} round />
                  <Skeleton width={SECTION_WIDTHS[s % 3]} height={12} />
                </div>
              ) : null}
              {ws.map((w, i) => (
                <div key={i} className="td-sk-row">
                  <Skeleton width={16} height={16} round />
                  <Skeleton width={`${w}%`} height={12} />
                  <Skeleton width={i % 2 ? 48 : 28} height={10} className="td-sk-end" />
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export interface ViewSkeletonProps {
  /** @default "board" */
  view?: "board" | "list" | "inbox";
  /** Columns (board) or sections (list) @default 3 */
  lists?: number;
  /** ms before the placeholder paints @default 150 */
  delay?: number;
  /** Visually hidden live text @default "Loading…" */
  label?: string;
  style?: CSSProperties;
  className?: string;
}

export const SKELETON_DELAY_MS = 150;

export function ViewSkeleton({ view = "board", lists = 3, delay = SKELETON_DELAY_MS, label = "Loading…", style, className }: ViewSkeletonProps) {
  // Nothing paints for the first `delay` ms; the timer is the only thing that flips `show`.
  const [shown, setShown] = useState(false);
  const show = delay <= 0 || shown;
  useEffect(() => {
    if (delay <= 0) return;
    const t = setTimeout(() => setShown(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <div className={["td-skview", className ?? ""].join(" ").trim()} role="status" aria-busy="true" aria-live="polite" style={style}>
      <span className="td-sr-only">{label}</span>
      {!show ? null : view === "board" ? <BoardSkeleton lists={lists} /> : view === "inbox" ? <ListSkeleton lists={1} header={false} rows={[64, 48, 72, 40]} /> : <ListSkeleton lists={lists} />}
    </div>
  );
}

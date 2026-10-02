// Comment — one comment or activity row. Comments render Markdown (mentions highlighted), carry
// reactions (chips + smile-plus picker) and, for the author, Edit (inline MentionField, ctrl+↵ save)
// and a two-step Delete; anyone gets Reply. Activity rows are one sentence around the bold actor.
import { useState, type ReactNode } from "react";

import { Avatar } from "../core/Avatar";
import { Button } from "../core/Button";
import { Icon } from "../core/Icon";
import { InlineError } from "../core/InlineError";
import { Markdown } from "../core/Markdown";
import { Popover, usePopover } from "../core/Popover";
import { MentionField, type MentionMember } from "./CommentComposer";
import "./Comment.css";

export const QUICK_REACTIONS = ["👍", "❤️", "🎉", "👀", "✅", "🚀", "😄", "🙏"];

function ReactionAdd({ onPick }: { onPick: (emoji: string) => void }) {
  const pop = usePopover();
  return (
    <Popover open={pop.open} onOpenChange={pop.setOpen} tier="detached" role="dialog" aria-label="Reactions" minWidth={0} trigger={<button type="button" className="td-react-add td-tip" aria-label="Add reaction" data-tip="Add reaction"><Icon name="smile-plus" size={14} /></button>}>
      <div className="td-react-grid">
        {QUICK_REACTIONS.map((e) => (
          <button
            key={e}
            type="button"
            className="td-react-pick"
            aria-label={`React ${e}`}
            onClick={() => {
              pop.close();
              onPick(e);
            }}
          >
            {e}
          </button>
        ))}
      </div>
    </Popover>
  );
}

export interface CommentReaction {
  emoji: string;
  count: number;
  mine?: boolean;
  by?: string[];
}
export interface CommentProps {
  author: string;
  src?: string;
  color?: string;
  meta?: string;
  variant?: "comment" | "activity";
  text?: string;
  children?: ReactNode;
  mine?: boolean;
  edited?: boolean | string;
  members?: ReadonlyArray<MentionMember>;
  reactions?: CommentReaction[];
  onReact?: (emoji: string) => void;
  /** May return a promise: editing stays open until it resolves, and shows why it rejected */
  onEdit?: (text: string) => void | Promise<unknown>;
  onDelete?: () => void;
  onReply?: () => void;
  onOpenKey?: (key: string) => void;
}

export function Comment({ author, src, color, meta = "just now", variant = "comment", text, children, mine, edited, members, reactions = [], onReact, onEdit, onDelete, onReply, onOpenKey }: CommentProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [confirm, setConfirm] = useState(false);
  const body = text ?? (typeof children === "string" ? children : null);
  const startEdit = () => {
    setDraft(body ?? "");
    setEditing(true);
  };
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopEditing = () => {
    setError(null);
    setEditing(false);
  };
  /** Stay in edit with the text until the change is saved; a failure says why and Save retries. */
  const save = async () => {
    const t = draft.trim();
    if (pending) return;
    if (!t || t === body) return stopEditing();
    setPending(true);
    setError(null);
    try {
      await onEdit?.(t);
      stopEditing();
    } catch (err) {
      setError(`Couldn't save: ${err instanceof Error ? err.message : "something went wrong"}`);
    } finally {
      setPending(false);
    }
  };
  const act = (f: () => void, label: string, cls?: string) => (
    <button type="button" className={"td-comment-act" + (cls ? ` ${cls}` : "")} onClick={f}>
      {label}
    </button>
  );
  return (
    <div className="td-comment">
      <Avatar name={author} src={src} color={color} size={32} />
      <div className="td-comment-main">
        {variant === "comment" ? (
          <>
            <div className="td-comment-meta">
              <b>{author}</b>
              <span>{meta}</span>
              {edited ? <span title={typeof edited === "string" ? `Edited ${edited}` : "Edited"}>· edited</span> : null}
            </div>
            {editing ? (
              <div className="td-comment-edit">
                <MentionField
                  value={draft}
                  onChange={setDraft}
                  members={members}
                  autoFocus
                  aria-label="Edit comment"
                  submitOnEnter={false}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault();
                      e.stopPropagation();
                      void save();
                    } else if (e.key === "Escape") {
                      e.stopPropagation();
                      stopEditing();
                    }
                  }}
                />
                <div className="td-comment-edit-foot">
                  <Button variant="primary" disabled={pending} onClick={() => void save()}>
                    {pending ? "Saving…" : error ? "Retry" : "Save"}
                  </Button>
                  <Button variant="ghost" disabled={pending} onClick={stopEditing}>
                    Cancel
                  </Button>
                  <span className="td-comment-edit-hint">ctrl ↵ save · esc</span>
                </div>
                <InlineError message={error} />
              </div>
            ) : (
              <div className="td-comment-bubble">{body != null ? <Markdown text={body} members={members} onOpenKey={onOpenKey} /> : children}</div>
            )}
            {!editing && (reactions.length || onReact) ? (
              <div className="td-react-row">
                {reactions.map((r) => (
                  <button key={r.emoji} type="button" className="td-react" aria-pressed={!!r.mine} aria-label={`${r.emoji} ${r.count}${r.by?.length ? ` — ${r.by.join(", ")}` : ""}`} title={r.by?.length ? r.by.join(", ") : undefined} onClick={() => onReact?.(r.emoji)}>
                    {r.emoji}
                    <span>{r.count}</span>
                  </button>
                ))}
                {onReact ? <ReactionAdd onPick={onReact} /> : null}
              </div>
            ) : null}
            {!editing ? (
              <div className="td-comment-actions">
                {confirm ? (
                  <>
                    <span>Delete this comment?</span>
                    {act(() => {
                      setConfirm(false);
                      onDelete?.();
                    }, "Delete", "is-danger")}
                    •{act(() => setConfirm(false), "Cancel")}
                  </>
                ) : (
                  <>
                    {onReply ? act(onReply, "Reply") : null}
                    {mine && onEdit ? (
                      <>
                        {onReply ? "•" : null}
                        {act(startEdit, "Edit")}
                      </>
                    ) : null}
                    {mine && onDelete ? (
                      <>
                        {onReply || onEdit ? "•" : null}
                        {act(() => setConfirm(true), "Delete")}
                      </>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="td-comment-body">
              <b>{author}</b> {body ?? children}
            </div>
            <div className="td-comment-meta td-comment-meta-act">
              <span>{meta}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// DescriptionEditor — the item description: Markdown in, Markdown out. View state renders the shared
// Markdown component (click it, or Tab to its Edit button, to edit; its links and keys stay links);
// edit state is a Tiptap editor restricted to the DS subset (headings, lists, tasks, quote, code,
// bold / italic / strike / inline code, links), the quiet toolbar, Save / Cancel; ctrl+↵ saves, Esc
// cancels. Tiptap serialises back to the same subset through @tiptap/markdown, so GitHub / Embridge
// round-trips stay exact. Spec: DESIGN.md › Description.
import { useEffect, useRef, useState, type ComponentType, type CSSProperties, type RefObject } from "react";

import { Button } from "../core/Button";
import { InlineError } from "../core/InlineError";
import { Markdown, type MarkdownMember } from "../core/Markdown";
import { Skeleton, SKELETON_DELAY_MS } from "../core/Skeleton";
import type { DescriptionEditProps } from "./DescriptionEdit";
import "../core/text.css";
import "./DescriptionEditor.css";

export interface DescriptionEditorProps {
  value?: string;
  /** May return a promise: the editor stays open with the draft until it resolves, and shows why it rejected */
  onChange?: (markdown: string) => void | Promise<unknown>;
  /** Mirrors the unsaved draft (null when none) so it can be kept while the overlay is closed */
  onDraft?: (draft: string | null) => void;
  /** A kept draft to resume: the editor opens with it */
  initialDraft?: string | null;
  /** Filled with the editor's own save, so the overlay's ctrl+↵ can await it (false = not saved) */
  saveRef?: RefObject<(() => Promise<boolean>) | null>;
  members?: ReadonlyArray<MarkdownMember>;
  onOpenKey?: (key: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  saveLabel?: string;
  /** Pointer Save / Cancel → the ctrl+↵ / esc hint */
  onSuggestShortcut?: (id: string, delay?: number) => void;
  style?: CSSProperties;
}

type EditorComponent = ComponentType<DescriptionEditProps>;
let loadedEditor: EditorComponent | null = null;

/** Warm the editor during idle time so editing still opens after the API goes offline. */
export async function preloadDescriptionEditor(): Promise<EditorComponent> {
  const module = await import("./DescriptionEdit");
  loadedEditor = module.DescriptionEdit;
  return loadedEditor;
}

export function DescriptionEditor({ value = "", onChange, onDraft, initialDraft, saveRef, members, onOpenKey, placeholder = "Add a more detailed description…", autoFocus, saveLabel = "Save", onSuggestShortcut, style }: DescriptionEditorProps) {
  const [Edit, setEdit] = useState<EditorComponent | null>(() => loadedEditor);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingShown, setLoadingShown] = useState(false);
  const [editing, setEditing] = useState(!!autoFocus || initialDraft != null);
  useEffect(() => {
    if (!editing || Edit) return;
    let active = true;
    const timer = setTimeout(() => setLoadingShown(true), SKELETON_DELAY_MS);
    void preloadDescriptionEditor().then(
      (component) => { if (active) setEdit(() => component); },
      () => { if (active) setLoadError("Couldn't load the editor. Check the connection and reload this page. Your saved drafts stay on this device."); },
    );
    return () => { active = false; clearTimeout(timer); };
  }, [editing, Edit]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draft = useRef<string | null>(initialDraft ?? null);
  const track = (d: string | null) => {
    draft.current = d;
    onDraft?.(d);
  };
  const beginEdit = () => {
    if (loadedEditor) setEdit(() => loadedEditor);
    setEditing(true);
  };
  const close = () => {
    track(null);
    setError(null);
    setLoadError(null);
    setLoadingShown(false);
    setEditing(false);
  };
  /** Leave edit only once the change is saved; a failure keeps the draft and says why. */
  const commit = async (md: string): Promise<boolean> => {
    // The cache may already show an optimistic value that the server refused. A kept draft or
    // previous error must reach onChange again even when it matches that visible value.
    if (md === value && !error && initialDraft == null) {
      close();
      return true;
    }
    track(md);
    setPending(true);
    setError(null);
    try {
      await onChange?.(md);
      // Typing can continue while the request is in flight. Confirm this submission without
      // clearing a newer draft that has not been submitted yet.
      if (draft.current == null || draft.current === md) close();
      return true;
    } catch (err) {
      if (draft.current == null || draft.current === md) track(md);
      setError(`Couldn't save: ${err instanceof Error ? err.message : "something went wrong"}`);
      return false;
    } finally {
      setPending(false);
    }
  };
  useEffect(() => {
    if (!saveRef) return;
    saveRef.current = () => {
      if (!editing) return Promise.resolve(true);
      if (!Edit) return Promise.resolve(false);
      if (draft.current != null) return commit(draft.current);
      return Promise.resolve(true);
    };
    return () => {
      saveRef.current = null;
    };
  });
  if (!editing)
    return (
      // Pointer: a click anywhere on the view edits, except on its own links and item keys. Keyboard:
      // the visually hidden Edit button, whose focus ring the view draws; links and keys stay separate stops.
      <div className="td-desc-view" title="Click to edit description" style={style} onClick={(e) => !(e.target as Element).closest("a, button, [role=link]") && beginEdit()}>
        {value.trim() ? <Markdown text={value} members={members} onOpenKey={onOpenKey} /> : <div className="td-desc-empty" aria-hidden>{placeholder}</div>}
        <button type="button" className="td-desc-editbtn td-sr-only" aria-label={value.trim() ? "Edit description" : placeholder} onClick={beginEdit} />
      </div>
    );
  if (!Edit) return (
    <div className="td-desc-edit" style={style} aria-busy={!loadError} onKeyDown={(event) => {
      if (event.key === "Escape") { event.stopPropagation(); close(); }
      else if (event.key.length === 1) event.stopPropagation();
    }}>
      {!loadError ? <div role="status"><span className="td-sr-only">Loading editor…</span>{loadingShown ? <Skeleton width="70%" height={32} /> : null}</div> : null}
      <InlineError message={loadError} className="td-desc-load-error" />
      <div className="td-desc-actions">
        {loadError ? <Button variant="primary" onClick={() => window.location.reload()}>Reload</Button> : null}
        <Button variant="ghost" autoFocus onClick={close}>{initialDraft != null ? "Discard" : "Cancel"}</Button>
      </div>
    </div>
  );
  return (
    <Edit
      value={value}
      initialDraft={initialDraft}
      placeholder={placeholder}
      saveLabel={pending ? "Saving…" : error ? "Retry" : saveLabel}
      pending={pending}
      error={error}
      onDraft={track}
      onSave={(md) => void commit(md)}
      onCancel={() => { if (!pending) close(); }}
      onSuggestShortcut={onSuggestShortcut}
      style={style}
    />
  );
}

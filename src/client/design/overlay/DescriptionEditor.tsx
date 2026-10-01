// DescriptionEditor — the item description: Markdown in, Markdown out. View state renders the shared
// Markdown component (click or Enter to edit); edit state is a Tiptap editor restricted to the DS
// subset (headings, lists, tasks, quote, code, bold / italic / strike / inline code, links), the
// quiet toolbar, Save / Cancel; ctrl+↵ saves, Esc cancels. Tiptap serialises back to the same subset
// through @tiptap/markdown, so GitHub / Embridge round-trips stay exact. Spec: DESIGN.md › Description.
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Markdown as TiptapMarkdown } from "@tiptap/markdown";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { useEffect, useState, type CSSProperties } from "react";

import { Button } from "../core/Button";
import { IconButton } from "../core/IconButton";
import type { IconName } from "../core/Icon";
import { Markdown, type MarkdownMember } from "../core/Markdown";
import "./DescriptionEditor.css";

export interface DescriptionEditorProps {
  value?: string;
  onChange?: (markdown: string) => void;
  /** Mirrors the unsaved draft (null when none) so a ctrl+↵ on the overlay can commit it */
  onDraft?: (draft: string | null) => void;
  members?: ReadonlyArray<MarkdownMember>;
  onOpenKey?: (key: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  saveLabel?: string;
  /** Pointer Save / Cancel → the ctrl+↵ / esc hint */
  onSuggestShortcut?: (id: string, delay?: number) => void;
  style?: CSSProperties;
}

type Tool = [icon: IconName, label: string, shortcut: string | null, run: (e: Editor) => void, active?: (e: Editor) => boolean];
const TOOLS: Array<Tool | null> = [
  ["bold", "Bold", "ctrl+B", (e) => e.chain().focus().toggleBold().run(), (e) => e.isActive("bold")],
  ["italic", "Italic", "ctrl+I", (e) => e.chain().focus().toggleItalic().run(), (e) => e.isActive("italic")],
  ["strikethrough", "Strikethrough", null, (e) => e.chain().focus().toggleStrike().run(), (e) => e.isActive("strike")],
  ["code", "Code", null, (e) => e.chain().focus().toggleCode().run(), (e) => e.isActive("code")],
  [
    "link",
    "Link",
    "ctrl+K",
    (e) => {
      if (e.isActive("link")) {
        e.chain().focus().unsetLink().run();
        return;
      }
      const url = window.prompt("Link URL", "https://");
      if (url) e.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    },
    (e) => e.isActive("link"),
  ],
  null,
  ["list", "Bulleted list", null, (e) => e.chain().focus().toggleBulletList().run(), (e) => e.isActive("bulletList")],
  ["list-ordered", "Numbered list", null, (e) => e.chain().focus().toggleOrderedList().run(), (e) => e.isActive("orderedList")],
  ["square-check", "Task list", null, (e) => e.chain().focus().toggleTaskList().run(), (e) => e.isActive("taskList")],
  ["text-quote", "Quote", null, (e) => e.chain().focus().toggleBlockquote().run(), (e) => e.isActive("blockquote")],
  ["heading", "Heading", null, (e) => e.chain().focus().toggleHeading({ level: 2 }).run(), (e) => e.isActive("heading")],
];

export function DescriptionEditor({ value = "", onChange, onDraft, members, onOpenKey, placeholder = "Add a more detailed description…", autoFocus, saveLabel = "Save", onSuggestShortcut, style }: DescriptionEditorProps) {
  const [editing, setEditing] = useState(!!autoFocus);
  if (!editing)
    return (
      <div
        className="td-desc-view"
        role="button"
        tabIndex={0}
        title="Click to edit description"
        style={style}
        onClick={() => setEditing(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setEditing(true);
          }
        }}
      >
        {value.trim() ? <Markdown text={value} members={members} onOpenKey={onOpenKey} /> : <div className="td-desc-empty">{placeholder}</div>}
      </div>
    );
  return (
    <DescriptionEdit
      value={value}
      placeholder={placeholder}
      saveLabel={saveLabel}
      onDraft={onDraft}
      onSave={(md) => {
        if (md !== value) onChange?.(md);
        onDraft?.(null);
        setEditing(false);
      }}
      onCancel={() => {
        onDraft?.(null);
        setEditing(false);
      }}
      onSuggestShortcut={onSuggestShortcut}
      style={style}
    />
  );
}

/** Mounts per edit session so the editor's content starts from the saved value every time. */
function DescriptionEdit({ value, placeholder, saveLabel, onDraft, onSave, onCancel, onSuggestShortcut, style }: { value: string; placeholder: string; saveLabel: string; onDraft?: (d: string | null) => void; onSave: (md: string) => void; onCancel: () => void; onSuggestShortcut?: (id: string, delay?: number) => void; style?: CSSProperties }) {
  const [dirty, setDirty] = useState(false);
  const [, bump] = useState(0);
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true }, underline: false }), TaskList, TaskItem.configure({ nested: true }), TiptapMarkdown],
    content: value,
    contentType: "markdown",
    autofocus: "end",
    editorProps: { attributes: { class: "td-desc-ta", "aria-label": "Description", "data-placeholder": placeholder } },
    onUpdate: ({ editor: e }) => {
      const md = e.getMarkdown().replace(/\s+$/, "");
      const changed = md !== value;
      setDirty(changed);
      onDraft?.(changed ? md : null);
    },
    onSelectionUpdate: () => bump((n) => n + 1),
    onTransaction: () => bump((n) => n + 1),
  });
  const save = () => onSave(editor ? editor.getMarkdown().replace(/\s+$/, "") : value);
  const hint = () => onSuggestShortcut?.("description", 200);
  useEffect(() => () => editor?.destroy(), [editor]);
  return (
    <div
      className="td-desc-edit"
      style={style}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          save();
        } else if (e.key.length === 1) e.stopPropagation();
      }}
    >
      <div className="td-desc-bar" role="toolbar" aria-label="Formatting">
        {TOOLS.map((t, i) => (t ? <IconButton key={t[0]} name={t[0]} label={t[1] + (t[2] ? ` (${t[2]})` : "")} title={t[1] + (t[2] ? ` · ${t[2]}` : "")} size={26} iconSize={15} aria-pressed={editor && t[4] ? t[4](editor) : undefined} onClick={() => editor && t[3](editor)} /> : <span key={`d${i}`} className="td-desc-bar-div" />))}
      </div>
      <EditorContent editor={editor} className="td-desc-editor" />
      <div className="td-desc-actions">
        <Button
          variant="primary"
          onClick={() => {
            save();
            hint();
          }}
        >
          {saveLabel}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            onCancel();
            hint();
          }}
        >
          Cancel
        </Button>
        {dirty ? <span className="td-desc-unsaved">Unsaved</span> : null}
      </div>
    </div>
  );
}

// The rich editing surface loads separately; read-only descriptions stay in DescriptionEditor.
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Markdown as TiptapMarkdown } from "@tiptap/markdown";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { useEffect, useState, type CSSProperties } from "react";

import { Button } from "../core/Button";
import { IconButton } from "../core/IconButton";
import { InlineError } from "../core/InlineError";
import type { IconName } from "../core/Icon";
import "./DescriptionEditor.css";

export interface DescriptionEditProps {
  value: string;
  initialDraft?: string | null;
  placeholder: string;
  saveLabel: string;
  pending: boolean;
  error: string | null;
  onDraft?: (draft: string | null) => void;
  onSave: (markdown: string) => void;
  onCancel: () => void;
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

/** Mounts per edit session so the editor's content starts from the saved value every time. */
export function DescriptionEdit({ value, initialDraft, placeholder, saveLabel, pending, error, onDraft, onSave, onCancel, onSuggestShortcut, style }: DescriptionEditProps) {
  const [dirty, setDirty] = useState(initialDraft != null);
  const [, bump] = useState(0);
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true }, underline: false }), TaskList, TaskItem.configure({ nested: true }), TiptapMarkdown],
    content: initialDraft ?? value,
    contentType: "markdown",
    autofocus: "end",
    editorProps: { attributes: { class: "td-desc-ta", "aria-label": "Description", "data-placeholder": placeholder } },
    onUpdate: ({ editor: e }) => {
      const md = e.getMarkdown().replace(/\s+$/, "");
      // Against the saved value as this editor serialises it, so valid Markdown in another spelling
      // ("## A\nB") isn't an edit the moment it opens (autofocus already dispatches an update).
      const saved = (e.markdown?.serialize(e.markdown.parse(value)) ?? value).replace(/\s+$/, "");
      const changed = (md !== saved && md !== value) || !!error;
      setDirty(changed);
      onDraft?.(changed ? md : null);
    },
    onSelectionUpdate: () => bump((n) => n + 1),
    onTransaction: () => bump((n) => n + 1),
  });
  // Unedited, the save hands back the value untouched rather than its reserialised spelling.
  const save = () => !pending && onSave(editor && dirty ? editor.getMarkdown().replace(/\s+$/, "") : value);
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
          disabled={pending}
          onClick={() => {
            save();
            hint();
          }}
        >
          {saveLabel}
        </Button>
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() => {
            onCancel();
            hint();
          }}
        >
          {dirty ? "Discard" : "Cancel"}
        </Button>
        {dirty ? <span className="td-desc-unsaved">Unsaved</span> : null}
      </div>
      <InlineError message={error} className="td-desc-error" />
    </div>
  );
}

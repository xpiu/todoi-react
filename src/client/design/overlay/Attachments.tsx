// Attachments — rows of 64×48 thumbnail (image preview, or file glyph + mono extension), name, meta
// line, hover Open and ⋯ (Download · Make / Remove cover · Rename · Delete with an inline confirm);
// uploads show a progress bar in place of the meta. Images open the Lightbox. Files arrive from the
// aside button, the section's Add, a drop over the panel (DropOverlay) or a drop on a card / row.
import { useEffect, useRef, useState, type DragEvent, type RefObject } from "react";

import { Button } from "../core/Button";
import { Icon, type IconName } from "../core/Icon";
import { IconButton } from "../core/IconButton";
import { MenuButton, MenuDivider, MenuItem } from "../core/Menu";
import { ProgressBar } from "../core/ProgressBar";
import "./Attachments.css";

export interface AttachmentFile {
  id: string;
  name: string;
  /** Inline URL (images preview from it) */
  src?: string;
  /** Download URL */
  url?: string;
  size?: number;
  mime?: string | null;
  /** "Added Sep 12" */
  meta?: string;
  isCover?: boolean;
  /** 0–100 while uploading */
  progress?: number;
}

const IMG = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;
export const isImageFile = (f: { mime?: string | null; name?: string; type?: string }) => !!((f.mime && /^image\//.test(f.mime)) || (f.type && /^image\//.test(f.type)) || IMG.test(f.name ?? ""));
export function formatBytes(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1048576).toFixed(n < 10485760 ? 1 : 0)} MB`;
}
const KIND: Record<string, [IconName, string]> = { pdf: ["file-text", "pdf"], doc: ["file-text", "doc"], docx: ["file-text", "doc"], md: ["file-text", "md"], txt: ["file-text", "txt"], csv: ["file-spreadsheet", "csv"], xls: ["file-spreadsheet", "xls"], xlsx: ["file-spreadsheet", "xls"], zip: ["file-archive", "zip"], mp4: ["file-video", "mp4"], mov: ["file-video", "mov"], mp3: ["file-audio", "mp3"], json: ["file-code-2", "json"], js: ["file-code-2", "js"], ts: ["file-code-2", "ts"], html: ["file-code-2", "html"] };
const kindOf = (name: string): [IconName, string] => {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  return KIND[ext] ?? ["file", ext.slice(0, 4) || "file"];
};

export interface AttachmentRowProps {
  file: AttachmentFile;
  onOpen?: () => void;
  onDownload?: () => void;
  onMakeCover?: () => void;
  onRemoveCover?: () => void;
  onRename?: (name: string) => void;
  onDelete?: () => void;
  onPreview?: () => void;
}

export function AttachmentRow({ file, onOpen, onDownload, onMakeCover, onRemoveCover, onRename, onDelete, onPreview }: AttachmentRowProps) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(file.name);
  const [confirm, setConfirm] = useState(false);
  const img = isImageFile(file) && (file.src || file.url);
  const uploading = file.progress != null && file.progress < 100;
  const [icon, ext] = kindOf(file.name);
  const commit = () => {
    const t = name.trim();
    if (t && t !== file.name) onRename?.(t);
    setRenaming(false);
  };
  const meta = [file.meta, file.size != null ? formatBytes(file.size) : null].filter(Boolean).join(" · ");
  return (
    <div className="td-att-row" data-uploading={uploading ? "true" : undefined}>
      <button type="button" className={"td-att-thumb" + (img ? " is-image" : "")} data-kind={img ? undefined : ext} aria-label={img ? `Preview ${file.name}` : file.name} tabIndex={img && onPreview ? 0 : -1} onClick={img && onPreview && !uploading ? onPreview : undefined}>
        {img ? (
          <img src={file.src ?? file.url} alt="" />
        ) : (
          <>
            <Icon name={icon} size={20} />
            {ext}
          </>
        )}
      </button>
      <div className="td-att-main">
        {renaming ? (
          <input
            className="td-att-rename"
            autoFocus
            value={name}
            aria-label="File name"
            onChange={(e) => setName(e.target.value)}
            onBlur={commit}
            onFocus={(e) => {
              const i = e.target.value.lastIndexOf(".");
              e.target.setSelectionRange(0, i > 0 ? i : e.target.value.length);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              else if (e.key === "Escape") {
                e.stopPropagation();
                setName(file.name);
                setRenaming(false);
              } else if (e.key.length === 1) e.stopPropagation();
            }}
          />
        ) : (
          <div className="td-att-name" title={file.name}>
            {file.name}
          </div>
        )}
        {uploading ? (
          <div className="td-att-progress">
            <ProgressBar value={file.progress} height={4} color="var(--blue-500)" className="td-att-bar" />
            <span className="td-att-meta">{Math.round(file.progress!)}%</span>
          </div>
        ) : confirm ? (
          <div className="td-att-confirm">
            Delete this file?
            <Button
              variant="ghost"
              className="td-att-danger"
              onClick={() => {
                setConfirm(false);
                onDelete?.();
              }}
            >
              Delete
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <div className="td-att-meta">
            {meta ? <span>{meta}</span> : null}
            {file.isCover ? (
              <span className="td-att-cover">
                {meta ? "· " : null}
                <Icon name="image" size={12} /> Cover
              </span>
            ) : null}
          </div>
        )}
      </div>
      {!uploading && !renaming && !confirm ? (
        <div className="td-att-actions">
          {onOpen || file.url ? <IconButton name="external-link" label={`Open ${file.name}`} tooltip="Open" size={28} iconSize={15} onClick={() => (onOpen ? onOpen() : window.open(file.url, "_blank", "noopener"))} /> : null}
          <MenuButton label={`Actions for ${file.name}`} tier="detached" size={28} iconSize={15} width={184}>
            {onDownload || file.url ? (
              <MenuItem icon="download" onSelect={() => (onDownload ? onDownload() : window.open(file.url, "_blank", "noopener"))}>
                Download
              </MenuItem>
            ) : null}
            {img && (onMakeCover || onRemoveCover) ? (
              <MenuItem icon="image" onSelect={() => (file.isCover ? onRemoveCover?.() : onMakeCover?.())}>
                {file.isCover ? "Remove cover" : "Make cover"}
              </MenuItem>
            ) : null}
            {onRename ? (
              <MenuItem
                icon="pencil"
                onSelect={() => {
                  setName(file.name);
                  setRenaming(true);
                }}
              >
                Rename
              </MenuItem>
            ) : null}
            {onDelete ? (
              <>
                <MenuDivider />
                <MenuItem icon="trash-2" danger onSelect={() => setConfirm(true)}>
                  Delete
                </MenuItem>
              </>
            ) : null}
          </MenuButton>
        </div>
      ) : null}
    </div>
  );
}

export interface AttachmentListProps {
  files: AttachmentFile[];
  onAdd?: (files: File[]) => void;
  onOpen?: (id: string) => void;
  onDownload?: (id: string) => void;
  onMakeCover?: (id: string) => void;
  onRemoveCover?: (id: string) => void;
  onRename?: (id: string, name: string) => void;
  onDelete?: (id: string) => void;
  accept?: string;
  /** Receives a function that opens the file picker */
  pickerRef?: RefObject<(() => void) | null>;
}

export function AttachmentList({ files, onAdd, onOpen, onDownload, onMakeCover, onRemoveCover, onRename, onDelete, accept, pickerRef }: AttachmentListProps) {
  const [preview, setPreview] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const images = files.filter((f) => isImageFile(f) && (f.src || f.url) && !(f.progress != null && f.progress < 100));
  useEffect(() => {
    if (pickerRef) pickerRef.current = () => inputRef.current?.click();
  }, [pickerRef]);
  return (
    <>
      <div className="td-att" role="list">
        {files.map((f) => (
          <AttachmentRow key={f.id} file={f} onOpen={onOpen ? () => onOpen(f.id) : undefined} onDownload={onDownload ? () => onDownload(f.id) : undefined} onMakeCover={onMakeCover ? () => onMakeCover(f.id) : undefined} onRemoveCover={onRemoveCover ? () => onRemoveCover(f.id) : undefined} onRename={onRename ? (n) => onRename(f.id, n) : undefined} onDelete={onDelete ? () => onDelete(f.id) : undefined} onPreview={() => setPreview(images.indexOf(f))} />
        ))}
      </div>
      {onAdd ? (
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept}
          className="td-att-input"
          aria-hidden
          tabIndex={-1}
          onChange={(e) => {
            const fs = Array.from(e.target.files ?? []);
            if (fs.length) onAdd(fs);
            e.target.value = "";
          }}
        />
      ) : null}
      {preview != null && preview >= 0 ? <Lightbox files={images} index={preview} onIndex={setPreview} onClose={() => setPreview(null)} /> : null}
    </>
  );
}

/** Full-viewport image preview above the overlay. ←/→ step through the item's images, Esc closes only the preview. */
export function Lightbox({ files, index, onIndex, onClose }: { files: AttachmentFile[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const f = files[index];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowRight" && files.length > 1) {
        e.stopPropagation();
        onIndex((index + 1) % files.length);
      } else if (e.key === "ArrowLeft" && files.length > 1) {
        e.stopPropagation();
        onIndex((index - 1 + files.length) % files.length);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [index, files.length, onClose, onIndex]);
  if (!f) return null;
  return (
    <div className="td-lightbox" role="dialog" aria-modal aria-label={f.name} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="td-lightbox-bar">
        <span className="td-lightbox-name">{f.name}</span>
        {files.length > 1 ? <span className="td-lightbox-count">{index + 1} / {files.length}</span> : null}
        {f.url ? <IconButton name="external-link" label="Open original" variant="chrome" onClick={() => window.open(f.url, "_blank", "noopener")} /> : null}
        <IconButton name="x" label="Close preview" variant="chrome" onClick={onClose} />
      </div>
      {files.length > 1 ? <IconButton name="chevron-left" label="Previous image" variant="chrome" size={40} iconSize={22} className="td-lightbox-nav is-prev" onClick={() => onIndex((index - 1 + files.length) % files.length)} /> : null}
      <img src={f.src ?? f.url} alt={f.name} />
      {files.length > 1 ? <IconButton name="chevron-right" label="Next image" variant="chrome" size={40} iconSize={22} className="td-lightbox-nav is-next" onClick={() => onIndex((index + 1) % files.length)} /> : null}
    </div>
  );
}

/** Drag-files-over-the-overlay sheet: white sheet + dashed action-blue frame. Render inside a position:relative container while `active`. */
export function DropOverlay({ active, label = "Drop files to attach", hint }: { active: boolean; label?: string; hint?: string }) {
  if (!active) return null;
  return (
    <div className="td-drop" aria-hidden>
      <div className="td-drop-inner">
        <Icon name="paperclip" size={22} color="var(--blue-500)" />
        {label}
        {hint ? <small>{hint}</small> : null}
      </div>
    </div>
  );
}

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

/** File-drop state for an element: [dragging, handlers]. In-app drags (items, subitems) are ignored. */
export function useFileDrop(onFiles: (files: File[]) => void, { disabled }: { disabled?: boolean } = {}) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const handlers = disabled
    ? {}
    : {
        onDragEnter: (e: DragEvent) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          depth.current++;
          setDragging(true);
        },
        onDragOver: (e: DragEvent) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        },
        onDragLeave: (e: DragEvent) => {
          if (!hasFiles(e)) return;
          depth.current = Math.max(0, depth.current - 1);
          if (!depth.current) setDragging(false);
        },
        onDrop: (e: DragEvent) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          depth.current = 0;
          setDragging(false);
          const fs = Array.from(e.dataTransfer.files ?? []);
          if (fs.length) onFiles(fs);
        },
      };
  return [dragging, handlers] as const;
}

/**
 * File drop onto items in a view (cards, rows): the element under the pointer matching `selector`
 * carries `className` (the dashed ring) and the drop reports its data-drag-id. Off a target the drop is refused.
 */
export function useFileDropTargets(onFiles: (files: File[], itemId: string) => void, { selector = "[data-drag-id]", className = "td-file-target", disabled }: { selector?: string; className?: string; disabled?: boolean } = {}) {
  const cur = useRef<HTMLElement | null>(null);
  const mark = (el: HTMLElement | null) => {
    if (cur.current === el) return;
    cur.current?.classList.remove(className);
    cur.current = el;
    el?.classList.add(className);
  };
  const handlers = disabled
    ? {}
    : {
        onDragEnter: (e: DragEvent) => {
          if (hasFiles(e)) e.preventDefault();
        },
        onDragOver: (e: DragEvent) => {
          if (!hasFiles(e)) return;
          const el = (e.target as HTMLElement).closest?.(selector) as HTMLElement | null;
          mark(el && !el.getAttribute("data-drag-id")?.includes("/") ? el : null);
          if (cur.current) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
          } else e.dataTransfer.dropEffect = "none";
        },
        onDragLeave: (e: DragEvent) => {
          if (hasFiles(e) && !(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) mark(null);
        },
        onDrop: (e: DragEvent) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          const el = cur.current;
          mark(null);
          const id = el?.getAttribute("data-drag-id");
          const fs = Array.from(e.dataTransfer.files ?? []);
          if (el && id && fs.length) onFiles(fs, id);
        },
      };
  return handlers;
}

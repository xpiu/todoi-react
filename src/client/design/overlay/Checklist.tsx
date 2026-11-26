// Checklist — the item's subitems: count + progress, rows with a checkbox and a hover ⋯ (Open ·
// Convert to item · Move to another item… · Delete), drag reorder (native + long-press), a
// row-styled add control. Spec: DESIGN.md › Subitems.
import { useRef, useState, type DragEvent } from "react";

import { Checkbox } from "../core/Checkbox";
import { Icon } from "../core/Icon";
import { IconButton } from "../core/IconButton";
import { ItemPickerDrill, type PickableItem } from "../core/ItemPicker";
import { MenuButton, MenuDivider, MenuItem, useMenuDrill } from "../core/Menu";
import { ProgressBar } from "../core/ProgressBar";
import { useReturnFocus } from "../core/returnFocus";
import { useTouchDrag } from "../core/touchDrag";
import "./Checklist.css";

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  itemId?: string;
}

/** One ghost row that becomes "+ [inline input]"; Enter commits and stays open, Esc or an empty blur closes. */
export function ChecklistAddRow({ open, label = "Add a subitem", placeholder = "Subitem title", onCommit, onDraft, onClose }: { open?: boolean; label?: string; placeholder?: string; onCommit: (text: string) => void; onDraft?: (text: string) => void; onClose?: () => void }) {
  const [adding, setAdding] = useState(!!open);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // Esc takes the focused field with it: focus returns to the add control.
  const addButton = useRef<HTMLButtonElement>(null);
  const leaving = useReturnFocus(adding, addButton);
  const set = (v: string) => {
    setDraft(v);
    onDraft?.(v);
  };
  const close = () => {
    leaving();
    set("");
    setAdding(false);
    onClose?.();
  };
  const commit = () => {
    const t = draft.trim();
    if (!t) return;
    onCommit(t);
    set("");
  };
  if (!adding)
    return (
      <button ref={addButton} type="button" className="td-checklist-add" onClick={() => setAdding(true)}>
        <Icon name="plus" size={16} />
        {label}
      </button>
    );
  return (
    <div
      className="td-checklist-add is-editing"
      onMouseDown={(e) => {
        if (e.target !== inputRef.current) {
          e.preventDefault();
          inputRef.current?.focus();
        }
      }}
    >
      <Icon name="plus" size={16} />
      <input
        ref={inputRef}
        className="td-checklist-add-input"
        value={draft}
        placeholder={placeholder}
        aria-label="New subitem"
        autoFocus
        onChange={(e) => set(e.target.value)}
        onBlur={() => {
          if (!draft.trim()) close();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          else if (e.key === "Escape") {
            e.stopPropagation();
            close();
          } else if (e.key.length === 1) e.stopPropagation();
        }}
      />
    </div>
  );
}

type RowActions = Pick<ChecklistProps, "onOpenItem" | "onConvertItem" | "onMoveItem" | "moveTargets" | "onDeleteItem">;

/** A row's hover ⋯: Open · Convert to item · Move to another item… (drills into an ItemPicker in the same menu; Esc or
 *  Back return) · Delete. Design: Checklist. */
function ChecklistRowMenu({ item: it, onOpenItem, onConvertItem, onMoveItem, moveTargets = [], onDeleteItem }: RowActions & { item: ChecklistItem }) {
  const drill = useMenuDrill<"main" | "move">("main");
  return (
    <MenuButton label={`Actions for ${it.text}`} tier="detached" size={24} iconSize={14} triggerClassName="td-checklist-row-more" width={drill.view === "move" ? 260 : 200} shouldClose={drill.shouldClose} onOpenChange={(o) => !o && drill.back()}>
      {(close) =>
        drill.view === "move" && onMoveItem ? (
          <ItemPickerDrill
            title="Move to another item"
            onBack={drill.back}
            items={moveTargets}
            onPick={(t) => {
              close();
              onMoveItem(it.id, t);
            }}
          />
        ) : (
          <>
            {onOpenItem && it.itemId ? (
              <MenuItem icon="square-arrow-out-up-right" onSelect={() => onOpenItem(it.id)}>
                Open <span className="td-checklist-open-key">{it.itemId}</span>
              </MenuItem>
            ) : null}
            {onConvertItem ? (
              <MenuItem icon="arrow-up-from-line" onSelect={() => onConvertItem(it.id)}>
                Convert to item
              </MenuItem>
            ) : null}
            {onMoveItem ? (
              <MenuItem icon="corner-down-right" drill onSelect={() => drill.setView("move")}>
                Move to another item…
              </MenuItem>
            ) : null}
            {onDeleteItem ? (
              <>
                {onOpenItem || onConvertItem || onMoveItem ? <MenuDivider /> : null}
                <MenuItem icon="trash-2" danger onSelect={() => onDeleteItem(it.id)}>
                  Delete
                </MenuItem>
              </>
            ) : null}
          </>
        )
      }
    </MenuButton>
  );
}

export interface ChecklistProps {
  items: ChecklistItem[];
  onToggle?: (id: string, done: boolean) => void;
  /** Drop `id` so it lands at `index` among the items */
  onReorder?: (id: string, index: number) => void;
  onAddItem?: (text: string) => void;
  addOpen?: boolean;
  onAddDraft?: (text: string) => void;
  onAddClose?: () => void;
  onOpenItem?: (id: string) => void;
  onConvertItem?: (id: string) => void;
  onMoveItem?: (id: string, target: PickableItem) => void;
  moveTargets?: PickableItem[];
  onDeleteItem?: (id: string) => void;
  /** Delete every subitem */
  onDelete?: () => void;
}

export function Checklist({ items, onToggle, onReorder, onAddItem, addOpen, onAddDraft, onAddClose, onOpenItem, onConvertItem, onMoveItem, moveTargets = [], onDeleteItem, onDelete }: ChecklistProps) {
  const [hideChecked, setHideChecked] = useState(false);
  const [from, setFrom] = useState<string | null>(null);
  const [ins, setIns] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const total = items.length, done = items.filter((it) => it.done).length;
  const pct = total ? (done / total) * 100 : 0;
  const visible = hideChecked ? items.filter((it) => !it.done) : items;
  const rowMenu = !!(onConvertItem || onMoveItem || onDeleteItem || onOpenItem);
  const dragging = !!onReorder && from != null;

  /** Insertion index among all items for a pointer at clientY, against the rendered rows. */
  const insertAt = (clientY: number): number | null => {
    const rows = listRef.current ? [...listRef.current.querySelectorAll<HTMLElement>("[data-id]")] : [];
    if (!rows.length) return null;
    for (const r of rows) {
      const b = r.getBoundingClientRect();
      if (clientY < b.top + b.height / 2) return items.findIndex((it) => it.id === r.dataset.id);
    }
    return items.findIndex((it) => it.id === rows[rows.length - 1]!.dataset.id) + 1;
  };
  const cueAt = (y: number, id: string) => {
    let i = insertAt(y);
    const f = items.findIndex((it) => it.id === id);
    if (i === f || i === f + 1) i = null;
    setIns(i);
    return i;
  };
  const clear = () => {
    setFrom(null);
    setIns(null);
  };
  const drop = (id: string, i: number | null) => {
    if (i != null && onReorder) {
      const f = items.findIndex((it) => it.id === id);
      onReorder(id, i > f ? i - 1 : i);
    }
    clear();
  };
  useTouchDrag(listRef, {
    selector: ".td-checklist-row[data-id]",
    disabled: !onReorder,
    onLift: (el) => setFrom(el.dataset.id ?? null),
    onMove: (p, d) => {
      if (d.dragId) cueAt(p.y, d.dragId);
    },
    onDrop: (p, d) => {
      if (d.dragId) drop(d.dragId, cueAt(p.y, d.dragId));
    },
    onCancel: clear,
  });
  const onDragOver = (e: DragEvent) => {
    if (!from) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    cueAt(e.clientY, from);
  };
  return (
    <div className={"td-checklist" + (dragging ? " is-dragging" : "")} role="group" aria-label="Subitems">
      <div className="td-checklist-head">
        {/* The section glyph: Minimal heads every overlay section with its 16px glyph; Rounded hides it */}
        <span className="td-checklist-head-icon" aria-hidden>
          <Icon name="list-checks" size={16} />
        </span>
        <span className="td-checklist-head-count">
          {done}/{total}
        </span>
        <ProgressBar value={pct} height={4} color={pct === 100 ? "var(--success-icon)" : "var(--blue-500)"} className="td-checklist-head-bar" aria-label={`${done} of ${total} subitems done`} />
        <div className="td-checklist-head-actions">
          {done > 0 ? <IconButton name={hideChecked ? "eye" : "eye-off"} size={24} iconSize={14} label={hideChecked ? "Show checked items" : "Hide checked items"} tooltip={hideChecked ? "Show checked items" : "Hide checked items"} onClick={() => setHideChecked((h) => !h)} /> : null}
          {onDelete ? <IconButton name="trash-2" size={24} iconSize={14} label="Delete subitems" tooltip="Delete subitems" onClick={onDelete} /> : null}
        </div>
      </div>
      <div
        ref={listRef}
        className="td-checklist-list"
        onDragOver={onReorder ? onDragOver : undefined}
        onDragLeave={onReorder ? (e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setIns(null);
        } : undefined}
        onDrop={onReorder ? (e) => {
          e.preventDefault();
          if (from) drop(from, ins);
        } : undefined}
      >
        {visible.map((it, k) => {
          const i = items.indexOf(it);
          const before = dragging && ins === i;
          const after = dragging && k === visible.length - 1 && ins != null && ins > items.indexOf(visible[visible.length - 1]!);
          return (
            <div
              key={it.id}
              data-id={it.id}
              className={"td-checklist-row" + (onReorder ? " is-draggable" : "") + (from === it.id ? " td-drag-src" : "")}
              draggable={onReorder ? true : undefined}
              onDragStart={onReorder ? (e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", it.text);
                requestAnimationFrame(() => {
                  setFrom(it.id);
                  setIns(null);
                });
              } : undefined}
              onDragEnd={onReorder ? clear : undefined}
            >
              {before ? <span className="td-checklist-line is-before" aria-hidden /> : null}
              {after ? <span className="td-checklist-line is-after" aria-hidden /> : null}
              <Checkbox checked={it.done} aria-label={it.text} onChange={(v) => onToggle?.(it.id, v)} />
              <span className={"td-checklist-row-text" + (it.done ? " td-checklist-row-done" : "")}>{it.text}</span>
              {onReorder ? (
                <span className="td-checklist-grip" aria-hidden>
                  <Icon name="grip-vertical" size={14} />
                </span>
              ) : null}
              {rowMenu ? <ChecklistRowMenu item={it} onOpenItem={onOpenItem} onConvertItem={onConvertItem} onMoveItem={onMoveItem} moveTargets={moveTargets} onDeleteItem={onDeleteItem} /> : null}
            </div>
          );
        })}
        {onAddItem ? <ChecklistAddRow open={addOpen} onCommit={onAddItem} onDraft={onAddDraft} onClose={onAddClose} /> : null}
      </div>
    </div>
  );
}

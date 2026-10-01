// LabelPicker — multi-select label picker with in-place create and edit: search, check rows (colour
// bar + name), pencil on hover to edit name / colour / delete, "Create “…”" when the query names no
// label. Value = label ids. A dialog Popover on the detached tier inside the overlay. Spec: DESIGN.md › Labels.
import { useState } from "react";

import { LABEL_COLORS, type LabelColor } from "../../../shared/enums";
import { LabelChip } from "../board/LabelChip";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { IconButton } from "./IconButton";
import { Popover, usePopover, type PopoverPlacement, type PopoverTier } from "./Popover";
import "./ItemPicker.css";
import "./LabelPicker.css";

export interface PickableLabel {
  id: string;
  name: string;
  color: LabelColor | string;
}
export interface LabelDraft {
  name: string;
  color: LabelColor;
}

const norm = (s: string) => s.trim().toLowerCase();
const WHITE_INK = new Set(["red", "pink", "blue"]);

/** The first palette colour no label uses, else cycle. */
export function nextLabelColor(labels: ReadonlyArray<PickableLabel>): LabelColor {
  const used = new Set(labels.map((l) => l.color));
  return LABEL_COLORS.find((c) => !used.has(c)) ?? LABEL_COLORS[labels.length % LABEL_COLORS.length]!;
}

function LabelForm({ initial, labels, onSave, onCancel, onDelete }: { initial: { label?: PickableLabel; draftName?: string }; labels: ReadonlyArray<PickableLabel>; onSave: (d: LabelDraft) => void; onCancel: () => void; onDelete?: (label: PickableLabel) => void }) {
  const [name, setName] = useState(initial.label?.name ?? initial.draftName ?? "");
  const [color, setColor] = useState<LabelColor>((initial.label?.color as LabelColor) ?? nextLabelColor(labels));
  const [confirm, setConfirm] = useState(false);
  const dup = labels.some((l) => norm(l.name) === norm(name) && l.id !== initial.label?.id);
  const ok = !!name.trim() && !dup;
  return (
    <div className="td-lp-form">
      <div className="td-lp-form-head">
        <IconButton name="arrow-left" label="Back to labels" size={24} iconSize={14} onClick={onCancel} />
        {initial.label ? "Edit label" : "New label"}
      </div>
      <input
        className="td-lp-name"
        autoFocus
        value={name}
        placeholder="Label name"
        aria-label="Label name"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && ok) {
            e.preventDefault();
            onSave({ name: name.trim(), color });
          } else if (e.key.length === 1) e.stopPropagation();
        }}
      />
      <div className="td-lp-swatches" role="radiogroup" aria-label="Label color">
        {LABEL_COLORS.map((c) => (
          <button key={c} type="button" className="td-lp-swatch" role="radio" aria-label={c} aria-checked={c === color} style={{ background: `var(--label-${c})` }} onClick={() => setColor(c)}>
            {c === color ? <Icon name="check" size={14} color={WHITE_INK.has(c) ? "var(--text-inverse)" : "var(--label-text)"} /> : null}
          </button>
        ))}
      </div>
      <div className="td-lp-preview">
        <LabelChip color={color} text={name.trim() || "Preview"} size="sm" />
        {dup ? <span className="td-lp-dup">A label with this name exists</span> : null}
      </div>
      <div className="td-lp-foot">
        <Button variant="primary" disabled={!ok} onClick={() => onSave({ name: name.trim(), color })}>
          Save
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        {initial.label && onDelete ? (
          confirm ? (
            <>
              <span className="td-lp-confirm">Remove from all items?</span>
              <Button variant="ghost" className="td-lp-danger" onClick={() => onDelete(initial.label!)}>
                Delete
              </Button>
            </>
          ) : (
            <Button variant="ghost" icon="trash-2" className="td-lp-danger td-lp-push" onClick={() => setConfirm(true)}>
              Delete
            </Button>
          )
        ) : null}
      </div>
    </div>
  );
}

export interface LabelPickerProps {
  labels: ReadonlyArray<PickableLabel>;
  /** Selected label ids */
  value: string[];
  onChange: (ids: string[]) => void;
  /** Resolves with the new label (so it can be selected) */
  onCreateLabel?: (draft: LabelDraft) => Promise<PickableLabel | void> | void;
  onEditLabel?: (label: PickableLabel, draft: LabelDraft) => void;
  onDeleteLabel?: (label: PickableLabel) => void;
  placeholder?: string;
  tier?: PopoverTier;
  placement?: PopoverPlacement;
  width?: number;
  block?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
}

export function LabelPicker({ labels, value, onChange, onCreateLabel, onEditLabel, onDeleteLabel, placeholder = "Labels", tier = "menu", placement = "bottom-start", width = 248, block, disabled, ...rest }: LabelPickerProps) {
  const pop = usePopover();
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<{ label?: PickableLabel; draftName?: string } | null>(null);
  const label = rest["aria-label"] ?? "Labels";
  const sel = new Set(value);
  const picked = labels.filter((l) => sel.has(l.id));
  const ql = norm(q);
  const list = labels.filter((l) => !ql || norm(l.name).includes(ql));
  const exact = labels.some((l) => norm(l.name) === ql);
  const toggle = (l: PickableLabel) => onChange(sel.has(l.id) ? value.filter((v) => v !== l.id) : [...value, l.id]);
  const create = async (d: LabelDraft) => {
    const made = await onCreateLabel?.(d);
    if (made) onChange([...value, made.id]);
    setEdit(null);
    setQ("");
  };
  return (
    <Popover
      open={pop.open}
      onOpenChange={(o) => {
        pop.setOpen(o);
        if (!o) {
          setQ("");
          setEdit(null);
        }
      }}
      placement={placement}
      tier={tier}
      width={width}
      role="dialog"
      aria-label={label}
      block={block}
      trigger={
        <Button variant="outline" icon="tag" disabled={disabled} aria-label={label} data-block={block ? "true" : undefined} className="td-aside-btn">
          <span className="td-lp-value" data-placeholder={picked.length ? undefined : "true"}>
            {picked.length ? picked.map((l) => <LabelChip key={l.id} color={l.color} text={l.name} size="sm" />) : placeholder}
          </span>
        </Button>
      }
    >
      {edit ? (
        <LabelForm
          initial={edit}
          labels={labels}
          onCancel={() => setEdit(null)}
          onSave={(d) => {
            if (edit.label) {
              onEditLabel?.(edit.label, d);
              setEdit(null);
            } else void create(d);
          }}
          onDelete={
            onDeleteLabel
              ? (l) => {
                  onDeleteLabel(l);
                  if (sel.has(l.id)) onChange(value.filter((v) => v !== l.id));
                  setEdit(null);
                }
              : undefined
          }
        />
      ) : (
        <>
          <div className="td-picker-search">
            <Icon name="search" size={14} />
            <input
              className="td-picker-input"
              autoFocus
              placeholder="Search or create…"
              aria-label="Search labels"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (list[0]) toggle(list[0]);
                  else if (ql && onCreateLabel) void create({ name: q.trim(), color: nextLabelColor(labels) });
                } else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  (e.currentTarget.closest(".td-pop")?.querySelector('[role="checkbox"]') as HTMLElement | null)?.focus();
                } else if (e.key.length === 1) e.stopPropagation();
              }}
            />
          </div>
          <div className="td-picker-list">
            {list.map((l) => (
              <div key={l.id} className="td-lp-row">
                <div
                  className="td-picker-row"
                  role="checkbox"
                  tabIndex={0}
                  aria-checked={sel.has(l.id)}
                  aria-label={l.name}
                  onClick={() => toggle(l)}
                  onKeyDown={(e) => {
                    if (e.key === " " || e.key === "Enter") {
                      e.preventDefault();
                      toggle(l);
                    }
                  }}
                >
                  <span className="td-lp-bar" style={{ background: `var(--label-${l.color})` }} />
                  <span className="td-lp-name-text">{l.name}</span>
                  {sel.has(l.id) ? <Icon name="check" size={14} className="td-lp-check" /> : null}
                </div>
                {onEditLabel ? <IconButton name="pencil" label={`Edit ${l.name}`} size={24} iconSize={13} className="td-lp-edit" onClick={() => setEdit({ label: l })} /> : null}
              </div>
            ))}
            {!list.length && !ql ? <div className="td-menu-note">No labels in this project yet</div> : null}
            {ql && !exact && onCreateLabel ? (
              <>
                {list.length ? <div className="td-menu-divider" /> : null}
                <button type="button" className="td-picker-row td-lp-action" onClick={() => setEdit({ draftName: q.trim() })}>
                  <Icon name="plus" size={14} />
                  Create “{q.trim()}”
                </button>
              </>
            ) : null}
            {!ql && onCreateLabel ? (
              <>
                {list.length ? <div className="td-menu-divider" /> : null}
                <button type="button" className="td-picker-row td-lp-action" onClick={() => setEdit({})}>
                  <Icon name="plus" size={14} />
                  New label
                </button>
              </>
            ) : null}
          </div>
        </>
      )}
    </Popover>
  );
}

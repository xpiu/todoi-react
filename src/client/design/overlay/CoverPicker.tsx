// CoverPicker — the item's cover: a colour row (8 label colours + two neutrals), the item's image
// attachments as tiles, Upload, Remove cover. Value is the cover ItemCard / Modal take: {color} or {src}.
import { useRef } from "react";

import { LABEL_COLORS } from "../../../shared/enums";
import { Button } from "../core/Button";
import { Icon } from "../core/Icon";
import { Popover, usePopover, type PopoverPlacement, type PopoverTier } from "../core/Popover";
import "./CoverPicker.css";

export interface CoverValue {
  /** CSS colour (a label token or neutral) */
  color?: string;
  src?: string;
  attachmentId?: string;
}
export interface CoverImage {
  id: string;
  name: string;
  src: string;
}
const WHITE_INK = new Set(["red", "pink", "blue"]);
const SWATCHES: Array<{ key: string; color: string; white: boolean }> = [...LABEL_COLORS.map((c) => ({ key: c, color: `var(--label-${c})`, white: WHITE_INK.has(c) })), { key: "neutral", color: "var(--surface-cover)", white: true }, { key: "navy", color: "var(--chrome-topbar)", white: true }];

export interface CoverPickerProps {
  cover: CoverValue | null;
  images?: CoverImage[];
  onChange: (cover: CoverValue | null) => void;
  onUpload?: (file: File) => void;
  placeholder?: string;
  tier?: PopoverTier;
  placement?: PopoverPlacement;
  block?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
}

export function CoverPicker({ cover, images = [], onChange, onUpload, placeholder = "Cover", tier = "menu", placement = "bottom-start", block, disabled, ...rest }: CoverPickerProps) {
  const pop = usePopover();
  const inputRef = useRef<HTMLInputElement>(null);
  const label = rest["aria-label"] ?? "Cover";
  const pick = (c: CoverValue | null) => {
    pop.close();
    onChange(c);
  };
  const curSwatch = cover && !cover.src ? SWATCHES.find((s) => s.color === cover.color) : null;
  return (
    <Popover
      open={pop.open}
      onOpenChange={pop.setOpen}
      placement={placement}
      tier={tier}
      width={232}
      role="dialog"
      aria-label={label}
      block={block}
      trigger={
        <Button variant="outline" icon={cover ? undefined : "image"} disabled={disabled} aria-label={label} data-block={block ? "true" : undefined} className="td-aside-btn">
          {cover ? cover.src ? <img className="td-cp-thumb" src={cover.src} alt="" /> : <span className="td-cp-dot" style={{ background: cover.color }} /> : null}
          <span className="td-cp-value" data-placeholder={cover ? undefined : "true"}>
            {cover ? (cover.src ? "Image cover" : `${curSwatch ? curSwatch.key[0]!.toUpperCase() + curSwatch.key.slice(1) : "Color"} cover`) : placeholder}
          </span>
        </Button>
      }
    >
      <div className="td-cp">
        <div className="td-menu-heading">Color</div>
        <div className="td-cp-swatches" role="radiogroup" aria-label="Cover color">
          {SWATCHES.map((s) => {
            const on = !!(cover && !cover.src && cover.color === s.color);
            return (
              <button key={s.key} type="button" className="td-cp-swatch" role="radio" aria-label={s.key} aria-checked={on} style={{ background: s.color }} onClick={() => pick({ color: s.color })}>
                {on ? <Icon name="check" size={14} color={s.white ? "var(--text-inverse)" : "var(--label-text)"} /> : null}
              </button>
            );
          })}
        </div>
        {images.length || onUpload ? (
          <>
            <div className="td-menu-heading">Image</div>
            <div className="td-cp-imgs">
              {images.map((f) => {
                const on = !!(cover?.src && (cover.attachmentId ? cover.attachmentId === f.id : cover.src === f.src));
                return (
                  <button key={f.id} type="button" className="td-cp-img" aria-label={f.name} aria-pressed={on} title={f.name} onClick={() => pick({ src: f.src, attachmentId: f.id })}>
                    <img src={f.src} alt="" />
                  </button>
                );
              })}
              {onUpload ? (
                <button type="button" className="td-cp-upload" onClick={() => inputRef.current?.click()}>
                  <Icon name="upload" size={14} />
                  Upload
                </button>
              ) : null}
            </div>
            {onUpload ? (
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="td-cp-file"
                aria-hidden
                tabIndex={-1}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    pop.close();
                    onUpload(f);
                  }
                  e.target.value = "";
                }}
              />
            ) : null}
          </>
        ) : null}
        {cover ? (
          <>
            <div className="td-menu-divider" />
            <button type="button" className="td-picker-row td-cp-remove" onClick={() => pick(null)}>
              <Icon name="x" size={14} />
              Remove cover
            </button>
          </>
        ) : null}
      </div>
    </Popover>
  );
}

// Relations — Blocked by · Blocks · Related to. RelationPicker = type segment + ItemPicker;
// RelationButton wraps it in a Popover; RelationsSection lists the item's relations grouped by type,
// Blocked by first and in red while any blocker is open. Spec: DESIGN.md › Relations.
import { useState } from "react";

import type { RelationType } from "../../../shared/enums";
import { Button } from "../core/Button";
import { Icon, type IconName } from "../core/Icon";
import { IconButton } from "../core/IconButton";
import { ItemPicker, statusGlyph, type PickableItem } from "../core/ItemPicker";
import { Popover, usePopover, type PopoverPlacement, type PopoverTier } from "../core/Popover";
import "./Relations.css";

export interface RelationTypeDef {
  id: RelationType;
  label: string;
  short: string;
  icon: IconName;
  color: string;
  inverse: RelationType;
  tone?: "danger";
}
export const RELATION_TYPE_DEFS: ReadonlyArray<RelationTypeDef> = [
  { id: "blocked_by", label: "Blocked by", short: "Blocked by", icon: "ban", color: "var(--danger)", inverse: "blocks", tone: "danger" },
  { id: "blocks", label: "Blocks", short: "Blocks", icon: "arrow-right-to-line", color: "var(--ink-600)", inverse: "blocked_by" },
  { id: "related", label: "Related to", short: "Related", icon: "link-2", color: "var(--ink-600)", inverse: "related" },
];

export interface Relation {
  type: RelationType;
  item: PickableItem;
}
/** The item is blocked while any "blocked by" relation points at an open item. */
export const isBlocked = (relations: ReadonlyArray<Relation>) => relations.some((r) => r.type === "blocked_by" && !r.item.done);

export function RelationPicker({ items, exclude = [], type: initial = "blocked_by", onAdd, onClose }: { items: PickableItem[]; exclude?: string[]; type?: RelationType; onAdd: (type: RelationType, item: PickableItem) => void; onClose?: () => void }) {
  const [type, setType] = useState<RelationType>(initial);
  return (
    <div className="td-rel-pick">
      <div className="td-rel-types" role="radiogroup" aria-label="Relation type">
        {RELATION_TYPE_DEFS.map((t) => (
          <button key={t.id} type="button" role="radio" aria-checked={type === t.id} onClick={() => setType(t.id)}>
            <Icon name={t.icon} size={13} color={type === t.id ? t.color : undefined} />
            {t.short}
          </button>
        ))}
      </div>
      <ItemPicker
        items={items}
        exclude={exclude}
        placeholder="Search by key or title…"
        onPick={(it) => {
          onAdd(type, it);
          onClose?.();
        }}
      />
    </div>
  );
}

export function RelationButton({ items, exclude, onAdd, label = "Relations", icon = "link-2", tier = "menu", placement = "bottom-start", block, iconOnly }: { items: PickableItem[]; exclude?: string[]; onAdd: (type: RelationType, item: PickableItem) => void; label?: string; icon?: IconName; tier?: PopoverTier; placement?: PopoverPlacement; block?: boolean; iconOnly?: boolean }) {
  const pop = usePopover();
  return (
    <Popover
      open={pop.open}
      onOpenChange={pop.setOpen}
      placement={placement}
      tier={tier}
      width={300}
      role="dialog"
      aria-label="Add relation"
      block={block}
      trigger={
        iconOnly ? (
          <IconButton name="plus" label={label} tooltip={label} size={24} iconSize={14} />
        ) : (
          <Button variant="outline" icon={icon} data-block={block ? "true" : undefined} className="td-aside-btn">
            {label}
          </Button>
        )
      }
    >
      <RelationPicker items={items} exclude={exclude} onAdd={onAdd} onClose={pop.close} />
    </Popover>
  );
}

export function RelationsSection({ relations, items, excludeIds = [], onAdd, onRemove, onOpen }: { relations: Relation[]; items: PickableItem[]; excludeIds?: string[]; onAdd?: (type: RelationType, item: PickableItem) => void; onRemove?: (type: RelationType, itemId: string) => void; onOpen?: (id: string) => void }) {
  const groups = RELATION_TYPE_DEFS.map((t) => ({ t, rows: relations.filter((r) => r.type === t.id) })).filter((g) => g.rows.length);
  const blocked = isBlocked(relations);
  if (!groups.length && !onAdd) return null;
  return (
    <div className="td-rel-section">
      <div className="td-rel-section-head">
        <Icon name="link-2" size={16} />
        <span className="td-rel-section-title">Relations</span>
        {blocked ? (
          <span className="td-rel-blocked">
            <Icon name="ban" size={13} />
            Blocked
          </span>
        ) : null}
        {onAdd ? <RelationButton items={items} exclude={[...excludeIds, ...relations.map((r) => r.item.id)]} onAdd={onAdd} iconOnly tier="detached" placement="bottom-end" label="Add relation" /> : null}
      </div>
      <div className="td-rel">
        {groups.map(({ t, rows }) => (
          <div key={t.id} className="td-rel-group">
            <div className="td-rel-head" data-tone={t.id === "blocked_by" && blocked ? "danger" : undefined}>
              <Icon name={t.icon} size={12} />
              {t.label}
            </div>
            {rows.map((r) => {
              const g = statusGlyph(r.item);
              return (
                <div key={`${r.item.id}-${t.id}`} className="td-rel-row">
                  <button type="button" className="td-rel-open" onClick={() => onOpen?.(r.item.id)} title={r.item.title}>
                    <Icon name={g.icon} size={15} color={g.color} />
                    {r.item.itemId ? <span className="td-rel-key">{r.item.itemId}</span> : null}
                    <span className="td-rel-title" data-done={r.item.done ? "true" : undefined}>
                      {r.item.title}
                    </span>
                    {r.item.listName ? <span className="td-rel-list">{r.item.listName}</span> : null}
                  </button>
                  {onRemove ? <IconButton name="x" label="Remove relation" tooltip="Remove" size={24} iconSize={13} className="td-rel-x" onClick={() => onRemove(t.id, r.item.id)} /> : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

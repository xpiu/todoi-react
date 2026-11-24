// ListGroups — the List view grouped by one field (Group by › Status · Priority · Assignee · Label · Due): one
// collapsible ListSection per group (`.td-list-section[data-group-id]`) with the group's glyph, name and count, inside
// a ListView, so the whole view is still one Tab stop. Groups replace the list sections; rows keep the item sort and
// there is no manual order. The host builds the groups (app/groups.ts), keeps which are collapsed, and owns the drag
// (useItemDnd in group mode), whose cue it passes back as `drop`. The keyboard twin of the drag lives here:
// Ctrl/Cmd+Shift+↑↓ (KeyNav onMoveGroup) moves the focused item to the previous / next group that takes it.
// Board and Calendar are never grouped. Spec: DESIGN.md › Group by.
import type { ReactNode } from "react";

import type { ListsViewProps } from "../board/listsView";
import { GroupLead, ListSection, type GroupLeadSpec } from "./ListSection";
import { ListView } from "./ListView";

/** One group of items in display order (Design: ViewControls ItemGroup) */
export interface ItemGroup<T = unknown> extends GroupLeadSpec {
  /** Stable id (a Status / priority / member / label id, a Due bucket, or GROUP_NONE) */
  id: string;
  label: string;
  /** Takes a dropped item; a group that stands for a range (Overdue, This week…) refuses */
  accepts: boolean;
  /** Why it refuses */
  refuse?: string;
  items: T[];
}

/** The drag cue the host's drag layer reports: the group under the pointer and whether it takes the item */
export interface GroupDropCue {
  groupId: string;
  state: "accept" | "refuse";
  note?: string;
}

export interface ListGroupsProps<T> extends Pick<ListsViewProps, "onItemKey" | "onItemSelect" | "onKeyDown" | "rootProps" | "ref" | "style" | "className"> {
  /** From groupItems — display order */
  groups: ItemGroup<T>[];
  /** Ids of collapsed groups (the host keeps them per project and group key, on the device) */
  collapsed?: ReadonlyArray<string>;
  onCollapsedChange?: (ids: string[]) => void;
  /** One ListRow per item; give it `dragId` (the item id) and a key unique within the group */
  renderRow: (item: T, group: ItemGroup<T>) => ReactNode;
  /** The section under a dragged item */
  drop?: GroupDropCue | null;
  /** Can the item move from one group to another? A null reason refuses silently */
  canDrop?: (itemId: string, fromGroupId: string | null, toGroupId: string) => { ok: boolean; reason?: string | null };
  /** An accepted keyboard move (drops come from the host's drag layer). Apply the change and raise ONE toast with Undo */
  onGroupDrop?: (itemId: string, fromGroupId: string | null, toGroupId: string) => void;
  /** What a keyboard move did, for screen readers: "Moved to High", or why no group takes the item */
  onAnnounce?: (message: string) => void;
  /** Line inside a group with no items (only with "Show empty groups") @default "No items" */
  emptyLabel?: string;
}

export function ListGroups<T>({ groups, collapsed = [], onCollapsedChange, renderRow, drop, canDrop, onGroupDrop, onAnnounce, emptyLabel = "No items", className, ...view }: ListGroupsProps<T>) {
  const toggle = (id: string, shut: boolean) => onCollapsedChange?.(shut ? [...collapsed.filter((x) => x !== id), id] : collapsed.filter((x) => x !== id));
  // The next group in that direction that takes the item; refusing groups are skipped, and the first refusal is
  // announced when none does. A collapsed target opens, so focus can follow the item there.
  const moveGroup = (id: string, dir: "up" | "down", from: string | null): string | null => {
    if (!onGroupDrop) return null;
    const step = dir === "up" ? -1 : 1;
    let why = "";
    for (let n = groups.findIndex((g) => g.id === from) + step; n >= 0 && n < groups.length; n += step) {
      const to = groups[n]!;
      const r = canDrop ? canDrop(id, from, to.id) : { ok: true };
      if (r.ok) {
        if (collapsed.includes(to.id)) toggle(to.id, false);
        onGroupDrop(id, from, to.id);
        onAnnounce?.(`Moved to ${to.label}`);
        return to.id;
      }
      why ||= r.reason ?? "";
    }
    onAnnounce?.(why || "No group to move to");
    return null;
  };
  return (
    <ListView {...view} onMoveGroup={moveGroup} showAddList={false} className={["td-list-groups", className ?? ""].join(" ").trim()}>
      {groups.map((g) => (
        <ListSection
          key={g.id}
          groupId={g.id}
          name={g.label}
          count={g.items.length}
          lead={<GroupLead group={g} />}
          menu={false}
          showAddRow={false}
          collapsed={collapsed.includes(g.id)}
          onCollapsedChange={(shut) => toggle(g.id, shut)}
          dropState={drop?.groupId === g.id ? drop.state : undefined}
          dropNote={drop?.groupId === g.id ? drop.note : undefined}
          empty={g.items.length ? undefined : emptyLabel}
        >
          {g.items.map((it) => renderRow(it, g))}
        </ListSection>
      ))}
    </ListView>
  );
}

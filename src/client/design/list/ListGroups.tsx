// ListGroups — the List view grouped by one field (Group by › Status · Priority · Assignee · Label · Due): one
// collapsible ListSection per group (`.td-list-section[data-group-id]`) with the group's glyph, name and count, inside
// a ListView, so the whole view is still one Tab stop. Groups replace the list sections; rows keep the item sort and
// there is no manual order. The host builds the groups (app/groups.ts), keeps which are collapsed, and owns the drag
// (useItemDnd in group mode), whose cue it passes back as `drop`. Board and Calendar are never grouped.
// Spec: DESIGN.md › Group by.
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
  /** Line inside a group with no items (only with "Show empty groups") @default "No items" */
  emptyLabel?: string;
}

export function ListGroups<T>({ groups, collapsed = [], onCollapsedChange, renderRow, drop, emptyLabel = "No items", className, ...view }: ListGroupsProps<T>) {
  const toggle = (id: string, shut: boolean) => onCollapsedChange?.(shut ? [...collapsed.filter((x) => x !== id), id] : collapsed.filter((x) => x !== id));
  return (
    <ListView {...view} showAddList={false} className={["td-list-groups", className ?? ""].join(" ").trim()}>
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

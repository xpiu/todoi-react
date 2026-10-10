// Shared view logic for items: the row shape ListRow / ItemCard consume, grouped by list and parent.
import type { ItemPriority } from "../../shared/enums";
import type { Item, Label } from "../data/api";
import { formatDate } from "../design/core/dates";
import { describeRepeat } from "../design/core/repeat";
import type { RowLabel, RowPerson, RowPriority } from "../design/list/ListRow";
import type { DueState } from "../design/board/DueDatePill";
import { attachmentUrl } from "../data/attachments";
import { SAMPLE_COVERS } from "../design/covers";

export const PRIORITY_LABEL: Record<ItemPriority, RowPriority> = { URGENT: "Urgent", HIGH: "High", MEDIUM: "Medium", LOW: "Low" };

export interface Person {
  id: string;
  name: string;
  nickname?: string | null;
  avatarColor?: string | null;
}

/** Overdue against `today` (ISO, from `useToday`, so it turns over at midnight). */
export function dueStateOf(item: Pick<Item, "dueDate" | "done">, today: string): DueState {
  if (item.done) return "complete";
  if (item.dueDate && item.dueDate < today) return "overdue";
  return "default";
}

export function keyOf(item: Pick<Item, "keyNumber">, prefix: string): string | undefined {
  return item.keyNumber != null && prefix ? `${prefix}-${item.keyNumber}` : undefined;
}

/** The card / overlay cover: a label colour tile, a sample SVG, or (later) an attachment. */
export function coverOf(item: Pick<Item, "cover"> | undefined): { src?: string; color?: string; attachmentId?: string } | null {
  const c = item?.cover;
  if (!c) return null;
  if (c.attachmentId) return { src: attachmentUrl(c.attachmentId), attachmentId: c.attachmentId };
  if (c.sample && SAMPLE_COVERS[c.sample]) return { src: SAMPLE_COVERS[c.sample] };
  if (c.color) return { color: `var(--label-${c.color})` };
  return null;
}

export interface RowModel {
  id: string;
  itemId?: string;
  title: string;
  done: boolean;
  labels: RowLabel[];
  due?: string;
  dueState: DueState;
  repeat?: string;
  priority?: RowPriority;
  assignees: RowPerson[];
  subitems: RowModel[];
  attachments?: number;
  created?: string;
  unread: boolean;
}

export interface RowOptions {
  prefix: string;
  labels: Label[];
  people: Person[];
  today: string;
  withCreated?: boolean;
  /** Overrides board order (a sort). */
  order?: ((a: Item, b: Item) => number) | null;
}

/** Share label and person lookups across every row in a view. */
export function itemRowMapper(opts: RowOptions) {
  const labelById = new Map(opts.labels.map((l) => [l.id, l]));
  const personById = new Map(opts.people.map((p) => [p.id, p]));
  return (it: Item): RowModel => ({
    id: it.id,
    itemId: keyOf(it, opts.prefix),
    title: it.title,
    done: it.done,
    labels: it.labelIds.map((id) => labelById.get(id)).filter((l): l is Label => !!l).map((l) => ({ color: l.color, text: l.name })),
    due: it.dueDate ? formatDate(it.dueDate) : undefined,
    dueState: dueStateOf(it, opts.today),
    repeat: it.repeatRule ? describeRepeat(it.repeatRule, it.dueDate) : undefined,
    priority: it.priority ? PRIORITY_LABEL[it.priority] : undefined,
    assignees: it.assigneeIds.map((id) => personById.get(id)).filter((p): p is Person => !!p).map((p) => ({ name: p.name, color: p.avatarColor ? `var(--label-${p.avatarColor})` : undefined })),
    subitems: [],
    attachments: it.attachmentCount || undefined,
    created: opts.withCreated ? formatDate(it.createdAt) : undefined,
    unread: it.unread,
  });
}

/** A view's active sort, with the same manual-order tie breakers for rendering and export. */
export function itemOrder(order: RowOptions["order"]) {
  return (a: Item, b: Item) => (order?.(a, b) ?? 0) || a.position - b.position || a.createdAt.localeCompare(b.createdAt);
}

/** Group once for the whole view, rather than scan all items again for each list. */
export function rowsByList(items: Item[], opts: RowOptions, toRow = itemRowMapper(opts)): Map<string, RowModel[]> {
  const byList = new Map<string, Item[]>();
  const byParent = new Map<string, Item[]>();
  for (const it of items) {
    const groups = it.parentItemId ? byParent : byList;
    const key = it.parentItemId ?? it.listId;
    const siblings = groups.get(key);
    if (siblings) siblings.push(it);
    else groups.set(key, [it]);
  }
  return new Map([...byList].map(([listId, siblings]) => {
    siblings.sort(itemOrder(opts.order));
    const rows = siblings.map((it) => {
      const subitems = (byParent.get(it.id) ?? []).filter((child) => child.listId === listId).sort((a, b) => a.position - b.position).map(toRow);
      return { ...toRow(it), subitems };
    });
    return [listId, rows];
  }));
}

/** Items of one list as row models: top-level rows in position order, each with its subitems. */
export function rowsForList(items: Item[], listId: string, opts: RowOptions): RowModel[] {
  return rowsByList(items.filter((it) => it.listId === listId), opts).get(listId) ?? [];
}

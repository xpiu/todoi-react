// Shared view logic for items: the row shape ListRow / ItemCard consume, grouped by list and parent.
import type { ItemPriority } from "../../shared/enums";
import type { Item, Label } from "../data/api";
import { formatDate, toISO } from "../design/core/dates";
import { describeRepeat } from "../design/core/repeat";
import type { RowLabel, RowPerson, RowPriority } from "../design/list/ListRow";
import type { DueState } from "../design/board/DueDatePill";
import { SAMPLE_COVERS } from "../design/covers";

export const PRIORITY_LABEL: Record<ItemPriority, RowPriority> = { URGENT: "Urgent", HIGH: "High", MEDIUM: "Medium", LOW: "Low" };

export interface Person {
  id: string;
  name: string;
  nickname?: string | null;
  avatarColor?: string | null;
}

export function dueStateOf(item: Pick<Item, "dueDate" | "done">, today = toISO(new Date())!): DueState {
  if (item.done) return "complete";
  if (item.dueDate && item.dueDate < today) return "overdue";
  return "default";
}

export function keyOf(item: Pick<Item, "keyNumber">, prefix: string): string | undefined {
  return item.keyNumber != null && prefix ? `${prefix}-${item.keyNumber}` : undefined;
}

/** The card / overlay cover: a label colour tile, a sample SVG, or (later) an attachment. */
export function coverOf(item: Pick<Item, "cover"> | undefined): { src?: string; color?: string } | null {
  const c = item?.cover;
  if (!c) return null;
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
  created?: string;
  unread: boolean;
}

/** Items of one list as row models: top-level rows in position order, each with its subitems. */
export function rowsForList(items: Item[], listId: string, opts: { prefix: string; labels: Label[]; people: Person[]; today?: string; withCreated?: boolean; /** Overrides board order (a sort) */ order?: ((a: Item, b: Item) => number) | null }): RowModel[] {
  const labelById = new Map(opts.labels.map((l) => [l.id, l]));
  const personById = new Map(opts.people.map((p) => [p.id, p]));
  const toRow = (it: Item): RowModel => ({
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
    created: opts.withCreated ? formatDate(it.createdAt) : undefined,
    unread: it.unread,
  });
  const inList = items.filter((it) => it.listId === listId);
  const byParent = new Map<string, Item[]>();
  for (const it of inList) {
    if (it.parentItemId) byParent.set(it.parentItemId, [...(byParent.get(it.parentItemId) ?? []), it]);
  }
  return inList
    .filter((it) => !it.parentItemId)
    .sort((a, b) => (opts.order ? opts.order(a, b) : 0) || a.position - b.position || a.createdAt.localeCompare(b.createdAt))
    .map((it) => ({ ...toRow(it), subitems: (byParent.get(it.id) ?? []).sort((a, b) => a.position - b.position).map(toRow) }));
}

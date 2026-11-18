// Checking items done from every surface — rows, cards, the calendar, the keyboard, the BulkBar, the
// overlay and the Inbox. The API applies the shared completion rules (src/shared/completion.ts); the
// toast and its Undo come from what it decided, so a recurring item reads and undoes the same everywhere.
import { useQueryClient } from "@tanstack/react-query";

import type { Occurrence } from "../../shared/completion";
import type { Item, ProjectDetail, UpdatedItem } from "../data/api";
import { useMoveItem, useUpdateItem, type ItemsScope } from "../data/mutations";
import { keys } from "../data/queries";
import { describeCompletion } from "../design/core/repeat";
import { count } from "../design/core/text";
import { snapshotUndo } from "./snapshotUndo";
import { quote, useFeedback } from "./feedback";

/** `rank`: the item's index among its list's top-level items before the request, where an Undo puts it back. */
type Outcome = { it: Item; occurrence: Occurrence | null; row: UpdatedItem; rank: number };
/** "Checked items move to Done" took the item to another list (the API decides; DESIGN.md › Lists & Status linking). */
const movedList = (o: Outcome) => o.row.listId !== o.it.listId;

export function useCompletion(scope: ItemsScope) {
  const updateItem = useUpdateItem(scope);
  const moveItem = useMoveItem(scope);
  const qc = useQueryClient();
  const notify = useFeedback((s) => s.notify);
  const listName = (o: Outcome) => qc.getQueryData<ProjectDetail>(keys.project(o.row.projectId ?? ""))?.lists.find((l) => l.id === o.row.listId)?.name ?? "the list";
  const rankOf = (it: Item) => {
    const cached = qc.getQueryData<Item[]>(keys.items(scope)) ?? [];
    return Math.max(0, cached.filter((x) => x.listId === it.listId && !x.parentItemId).sort((a, b) => a.position - b.position).findIndex((x) => x.id === it.id));
  };

  /** One request per item, in turn; `ifDue` makes a retried completion count once. Failures report themselves. */
  const apply = async (items: Item[], done: boolean): Promise<Outcome[]> => {
    const outcomes: Outcome[] = [];
    for (const it of items) {
      const rank = rankOf(it);
      try {
        const row = await updateItem.mutateAsync({ id: it.id, done, ...(done && it.repeatRule && it.dueDate ? { ifDue: it.dueDate } : {}) });
        outcomes.push({ it, occurrence: row.occurrence, row, rank });
      } catch { /* The mutation reports the request error. */ }
    }
    return outcomes;
  };

  /** Restore only the fields completion changed, and report later edits to them. A moved item goes back to its list and place first. */
  const undoSteps = (outcomes: Outcome[]) => snapshotUndo(outcomes.map((o) => {
    const { it, occurrence, row } = o;
    const fields = occurrence ? { dueDate: it.dueDate, startDate: it.startDate, repeatCount: it.repeatCount, ...(occurrence.ended ? { status: it.status } : {}) } : { status: it.status };
    const before = movedList(o) ? { ...fields, listId: it.listId, position: o.rank } : fields;
    const after = Object.fromEntries(Object.keys(before).map((key) => [key, row[key as keyof UpdatedItem]]));
    const restore = async () => {
      if (movedList(o)) await moveItem.mutateAsync({ id: it.id, listId: it.listId, position: o.rank, quiet: true });
      return updateItem.mutateAsync({ id: it.id, ...fields, quiet: true });
    };
    return { id: it.id, before, after, restore };
  }));

  /** One item: a recurring completion ("— next due Sep 3") or a move to the Done list raises an undoable toast; others need none. */
  const setDone = async (it: Item, done: boolean) => {
    const [outcome] = await apply([it], done);
    if (!outcome) return;
    if (outcome.occurrence && !outcome.occurrence.ended) notify({ ...describeCompletion(outcome.occurrence, it.repeatRule, { title: it.title }), restore: undoSteps([outcome]) });
    else if (movedList(outcome)) {
      const base = `${done ? "Completed" : "Reopened"} ${quote(it.title)}`;
      notify({ message: `${base} — ${done ? "moved to" : "moved back to"} ${listName(outcome)}`, history: base, icon: "circle-check", restore: undoSteps([outcome]) });
    } else if (outcome.occurrence) notify({ ...describeCompletion(outcome.occurrence, it.repeatRule, { title: it.title }), restore: undoSteps([outcome]) });
  };

  /** The BulkBar: one toast for the selection, and one Undo that retries only what is left to restore. */
  const setDoneMany = async (items: Item[], done: boolean) => {
    const undoScope = useFeedback.getState().scope;
    const outcomes = await apply(items, done);
    if (!outcomes.length || useFeedback.getState().scope !== undoScope) return;
    const moved = outcomes.filter((o) => o.occurrence && !o.occurrence.ended).length;
    const relisted = outcomes.filter(movedList);
    const base = `Marked ${count(outcomes.length, "item")} ${done ? "done" : "not done"}`;
    const where = !relisted.length ? "" : done ? ` — ${relisted.length} moved to ${listName(relisted[0]!)}` : ` — ${relisted.length} moved back`;
    notify({
      message: base + (moved ? ` — ${count(moved, "recurring item")} moved to the next date` : "") + where,
      history: base,
      meta: outcomes.length < items.length ? `${items.length - outcomes.length} not changed` : undefined,
      icon: "circle-check",
      restore: undoSteps(outcomes),
    });
  };

  return { setDone, setDoneMany };
}

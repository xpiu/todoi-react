// Checking items done from every surface — rows, cards, the calendar, the keyboard, the BulkBar, the
// overlay and the Inbox. The API applies the shared completion rules (src/shared/completion.ts); the
// toast and its Undo come from what it decided, so a recurring item reads and undoes the same everywhere.
import type { Occurrence } from "../../shared/completion";
import type { Item, UpdatedItem } from "../data/api";
import { useUpdateItem, type ItemsScope } from "../data/mutations";
import { describeCompletion } from "../design/core/repeat";
import { count } from "../design/core/text";
import { snapshotUndo } from "./snapshotUndo";
import { useFeedback } from "./feedback";

type Outcome = { it: Item; occurrence: Occurrence | null; row: UpdatedItem };

export function useCompletion(scope: ItemsScope) {
  const updateItem = useUpdateItem(scope);
  const notify = useFeedback((s) => s.notify);

  /** One request per item, in turn; `ifDue` makes a retried completion count once. Failures report themselves. */
  const apply = async (items: Item[], done: boolean): Promise<Outcome[]> => {
    const outcomes: Outcome[] = [];
    for (const it of items) {
      try {
        const row = await updateItem.mutateAsync({ id: it.id, done, ...(done && it.repeatRule && it.dueDate ? { ifDue: it.dueDate } : {}) });
        outcomes.push({ it, occurrence: row.occurrence, row });
      } catch { /* The mutation reports the request error. */ }
    }
    return outcomes;
  };

  /** Restore only the fields completion changed, and report later edits to them. */
  const undoSteps = (outcomes: Outcome[]) => snapshotUndo(outcomes.map(({ it, occurrence, row }) => {
    const before = occurrence ? { dueDate: it.dueDate, startDate: it.startDate, repeatCount: it.repeatCount, ...(occurrence.ended ? { done: false } : {}) } : { status: it.status };
    const after = Object.fromEntries(Object.keys(before).map((key) => [key, row[key as keyof UpdatedItem]]));
    return { id: it.id, before, after, restore: () => updateItem.mutateAsync({ id: it.id, ...before, quiet: true }) };
  }));

  /** One item: a recurring completion raises an undoable toast ("— next due Sep 3"); others need none. */
  const setDone = async (it: Item, done: boolean) => {
    const [outcome] = await apply([it], done);
    if (!outcome?.occurrence) return;
    notify({ ...describeCompletion(outcome.occurrence, it.repeatRule, { title: it.title }), restore: undoSteps([outcome]) });
  };

  /** The BulkBar: one toast for the selection, and one Undo that retries only what is left to restore. */
  const setDoneMany = async (items: Item[], done: boolean) => {
    const undoScope = useFeedback.getState().scope;
    const outcomes = await apply(items, done);
    if (!outcomes.length || useFeedback.getState().scope !== undoScope) return;
    const moved = outcomes.filter((o) => o.occurrence && !o.occurrence.ended).length;
    const base = `Marked ${count(outcomes.length, "item")} ${done ? "done" : "not done"}`;
    notify({
      message: base + (moved ? ` — ${count(moved, "recurring item")} moved to the next date` : ""),
      history: base,
      meta: outcomes.length < items.length ? `${items.length - outcomes.length} not changed` : undefined,
      icon: "circle-check",
      restore: undoSteps(outcomes),
    });
  };

  return { setDone, setDoneMany };
}

// Checking items done from every surface — rows, cards, the calendar, the keyboard, the BulkBar, the
// overlay and the Inbox. The API applies the shared completion rules (src/shared/completion.ts); the
// toast and its Undo come from what it decided, so a recurring item reads and undoes the same everywhere.
import type { Occurrence } from "../../shared/completion";
import type { Item } from "../data/api";
import { useUpdateItem, type ItemsScope } from "../data/mutations";
import { describeCompletion } from "../design/core/repeat";
import { count } from "../design/core/text";
import { useFeedback } from "./feedback";

type Outcome = { it: Item; occurrence: Occurrence | null };

export function useCompletion(scope: ItemsScope) {
  const updateItem = useUpdateItem(scope);
  const notify = useFeedback((s) => s.notify);

  /** One request per item, in turn; `ifDue` makes a retried completion count once. Failures report themselves. */
  const apply = async (items: Item[], done: boolean): Promise<Outcome[]> => {
    const outcomes: Outcome[] = [];
    for (const it of items) {
      try {
        const row = await updateItem.mutateAsync({ id: it.id, done, ...(done && it.repeatRule && it.dueDate ? { ifDue: it.dueDate } : {}) });
        outcomes.push({ it, occurrence: row.occurrence });
      } catch { /* The mutation reports the request error. */ }
    }
    return outcomes;
  };

  /** Put an item back exactly as it was before this request. */
  const undo = ({ it, occurrence }: Outcome) =>
    updateItem.mutateAsync(
      // Undo reports its own failure ("Couldn't undo. …" with Retry Undo).
      { quiet: true, ...(occurrence ? { id: it.id, dueDate: it.dueDate, repeatCount: it.repeatCount, ...(occurrence.ended ? { done: false } : {}) }
      : it.done ? { id: it.id, status: "DONE" as const } : { id: it.id, done: false }) },
    );

  /** One item: a recurring completion raises an undoable toast ("— next due Sep 3"); others need none. */
  const setDone = async (it: Item, done: boolean) => {
    const [outcome] = await apply([it], done);
    if (!outcome?.occurrence) return;
    notify({ ...describeCompletion(outcome.occurrence, it.repeatRule, { title: it.title }), restore: () => undo(outcome) });
  };

  /** The BulkBar: one toast for the selection, and one Undo that retries only what is left to restore. */
  const setDoneMany = async (items: Item[], done: boolean) => {
    const undoScope = useFeedback.getState().scope;
    const outcomes = await apply(items, done);
    if (!outcomes.length || useFeedback.getState().scope !== undoScope) return;
    const moved = outcomes.filter((o) => o.occurrence && !o.occurrence.ended).length;
    const base = `Marked ${count(outcomes.length, "item")} ${done ? "done" : "not done"}`;
    const pending = [...outcomes];
    notify({
      message: base + (moved ? ` — ${count(moved, "recurring item")} moved to the next date` : ""),
      history: base,
      meta: outcomes.length < items.length ? `${items.length - outcomes.length} not changed` : undefined,
      icon: "circle-check",
      restore: async () => {
        while (pending.length) {
          await undo(pending[0]!);
          pending.shift();
        }
      },
    });
  };

  return { setDone, setDoneMany };
}

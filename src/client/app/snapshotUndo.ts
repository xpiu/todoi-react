import { api, unwrap, type Item, type ItemLocation } from "../data/api";

type Values = Record<string, unknown>;
interface SnapshotStep {
  id: string;
  before: Values;
  after: Values;
  restore: () => Promise<unknown>;
}

const names: Record<string, string> = { priority: "priority", labelIds: "labels", assigneeIds: "assignees", startDate: "dates", dueDate: "dates", repeatCount: "recurrence", status: "status", done: "status", listId: "list", position: "position", parentItemId: "parent item", projectId: "project" };
const equal = (a: unknown, b: unknown) => JSON.stringify(Array.isArray(a) ? [...a].sort() : a) === JSON.stringify(Array.isArray(b) ? [...b].sort() : b);

/** Read at Undo time. Retry keeps completed steps and their feedback without restoring them twice. */
export function snapshotUndo(steps: SnapshotStep[], read: (id: string) => Promise<Values> = readItem) {
  let at = 0;
  const reverted = new Set<string>();
  return async () => {
    while (at < steps.length) {
      const step = steps[at]!;
      const current = await read(step.id);
      const fields = Object.keys(step.after).filter((key) => !equal(current[key], step.after[key]) && !equal(current[key], step.before[key]));
      await step.restore();
      fields.forEach((key) => reverted.add(names[key] ?? key));
      at++;
    }
    return { revertedFields: [...reverted] };
  };
}

/** Scoped snapshots include queued field edits, including labels and assignees. */
async function readItem(id: string): Promise<Values> {
  const location = await api.api.items[":id"].$get({ param: { id } }).then((r) => unwrap<ItemLocation>(r));
  const rows = await api.api.items.$get({ query: { listId: location.listId } }).then((r) => unwrap<Item[]>(r));
  return rows.find((item) => item.id === id) ?? location;
}

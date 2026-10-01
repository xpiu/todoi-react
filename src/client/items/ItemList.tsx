import { useState, type FormEvent } from "react";

import { ITEM_STATUSES } from "../../shared/item-status";
import { Button } from "../design/core/Button";
import { newItemId, useCreateItem, useDeleteItem, useItems, useUpdateItem } from "./useItems";

/** Placeholder list from the scaffold; the List view (Phase 4) replaces it. */
export function ItemList() {
  const items = useItems();
  const create = useCreateItem();
  const update = useUpdateItem();
  const remove = useDeleteItem();
  const [title, setTitle] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    create.mutate({ id: newItemId(), title: trimmed });
    setTitle("");
  }

  if (items.isError) return <p role="alert">Could not load items: {items.error.message}</p>;
  if (!items.isSuccess) return <p className="td-placeholder-empty">Loading…</p>;

  return (
    <>
      <form onSubmit={onSubmit} className="td-placeholder-add">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add an item"
          aria-label="New item title"
          autoFocus
        />
        <Button type="submit" variant="primary" icon="plus">
          Add
        </Button>
      </form>

      {items.data.length === 0 ? (
        <p className="td-placeholder-empty">Nothing here yet.</p>
      ) : (
        <ul className="td-placeholder-list">
          {items.data.map((item) => (
            <li key={item.id} className="td-placeholder-row" data-status={item.done ? "DONE" : (item.status ?? "")}>
              <input
                type="checkbox"
                checked={item.done}
                onChange={(e) => update.mutate({ id: item.id, done: e.target.checked })}
                aria-label={`Mark "${item.title}" ${item.done ? "not done" : "done"}`}
              />
              <span className="td-placeholder-title">{item.title}</span>
              <select
                value={item.status ?? ""}
                onChange={(e) =>
                  update.mutate({ id: item.id, status: (e.target.value || null) as typeof item.status })
                }
                aria-label={`Status of "${item.title}"`}
              >
                <option value="">None</option>
                {ITEM_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0) + s.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
              <Button variant="ghost" icon="x" aria-label={`Delete "${item.title}"`} onClick={() => remove.mutate({ id: item.id })} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

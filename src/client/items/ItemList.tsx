import { useState, type FormEvent } from "react";

import { ITEM_STATUSES } from "../../shared/item-status";
import { newItemId, useCreateItem, useDeleteItem, useItems, useUpdateItem } from "./useItems";

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
  if (!items.isSuccess) return <p>Loading…</p>;

  return (
    <>
      <form onSubmit={onSubmit} className="add">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task"
          aria-label="New task title"
          autoFocus
        />
        <button type="submit">Add</button>
      </form>

      {items.data.length === 0 ? (
        <p className="empty">Nothing here yet.</p>
      ) : (
        <ul className="items">
          {items.data.map((item) => (
            <li key={item.id} data-status={item.status}>
              <input
                type="checkbox"
                checked={item.status === "DONE"}
                onChange={(e) =>
                  update.mutate({ id: item.id, status: e.target.checked ? "DONE" : "TODO" })
                }
                aria-label={`Mark "${item.title}" ${item.status === "DONE" ? "not done" : "done"}`}
              />
              <span className="title">{item.title}</span>
              <select
                value={item.status}
                onChange={(e) =>
                  update.mutate({ id: item.id, status: e.target.value as typeof item.status })
                }
                aria-label={`Status of "${item.title}"`}
              >
                {ITEM_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0) + s.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => remove.mutate({ id: item.id })} aria-label={`Delete "${item.title}"`}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

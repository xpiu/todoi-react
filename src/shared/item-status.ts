/** Stable status ids. Mirrors the Postgres enum in the schema. */
export const ITEM_STATUSES = ["NEW", "BACKLOG", "TODO", "DOING", "DONE"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];
/** Display names: the client's Status registry and the server's activity text ("— Status set to Doing") */
export const STATUS_NAMES: Record<ItemStatus, string> = { NEW: "New", BACKLOG: "Backlog", TODO: "To-do", DOING: "Doing", DONE: "Done" };

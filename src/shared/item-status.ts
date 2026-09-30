/** Stable status ids; display names live in the UI. Mirrors the Postgres enum in the schema. */
export const ITEM_STATUSES = ["NEW", "BACKLOG", "TODO", "DOING", "DONE"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

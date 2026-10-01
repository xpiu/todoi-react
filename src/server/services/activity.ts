// The project activity log is written wherever the API mutates a project (DESIGN.md › Project lifecycle › Log).
import { nanoid } from "nanoid";

import type { ActivityType } from "../../shared/enums";
import { db } from "../db";
import { activity } from "../db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface LogEntry {
  projectId: string | null | undefined;
  actorId: string | null;
  type: ActivityType;
  /** The sentence after the actor: 'moved “Pricing page” from To-do to Doing' */
  text: string;
  itemId?: string | null;
  itemKey?: string | null;
}

/** Append one row; Inbox changes (no project) are not logged. */
export async function logActivity(tx: Tx | typeof db, e: LogEntry) {
  if (!e.projectId) return;
  await tx.insert(activity).values({ id: nanoid(), projectId: e.projectId, itemId: e.itemId ?? null, actorId: e.actorId, type: e.type, text: e.text, itemKey: e.itemKey ?? null });
}

/** “Pricing page: do we show…” — titles in sentences are quoted and clipped. */
export const quote = (title: string, max = 40) => "“" + (title.length > max ? title.slice(0, max - 1).trimEnd() + "…" : title) + "”";

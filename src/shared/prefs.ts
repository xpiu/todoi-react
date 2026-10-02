// Account preferences behind Settings › General and › Notifications: stored on the account so they
// follow the person to every device, and read by the API for notification opt-outs. Appearance stays
// on the device (its own store). Spec: DESIGN.md › Settings.
import { z } from "zod";

import { ITEM_PRIORITIES } from "./enums";

export const prefsSchema = z.object({
  timeFormat: z.enum(["24h", "12h"]),
  weekStart: z.enum(["mon", "sun", "sat"]),
  dateFormat: z.enum(["mdy-text", "dmy-text", "iso", "mdy", "dmy"]),
  showCompleted: z.boolean(),
  smartDates: z.boolean(),
  defaultPriority: z.enum(["none", ...ITEM_PRIORITIES]),
  notifyMentions: z.boolean(),
  notifyAssignments: z.boolean(),
  notifyWatched: z.boolean(),
  inboxBadge: z.boolean(),
});
export type Prefs = z.infer<typeof prefsSchema>;
export const prefsPatchSchema = prefsSchema.partial().refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export const DEFAULT_PREFS: Prefs = { timeFormat: "24h", weekStart: "mon", dateFormat: "mdy-text", showCompleted: true, smartDates: true, defaultPriority: "none", notifyMentions: true, notifyAssignments: true, notifyWatched: true, inboxBadge: true };

/** Stored prefs over the defaults; unknown or invalid keys (an older or newer client) are dropped. */
export function prefsOf(stored: unknown): Prefs {
  const out: Record<string, unknown> = { ...DEFAULT_PREFS };
  if (stored && typeof stored === "object") {
    for (const [k, field] of Object.entries(prefsSchema.shape)) {
      const v = field.safeParse((stored as Record<string, unknown>)[k]);
      if (v.success) out[k] = v.data;
    }
  }
  return out as Prefs;
}

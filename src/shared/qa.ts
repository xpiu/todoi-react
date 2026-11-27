// QA notes: todoi's own people (a confirmed @todoi.com sign-in) summon a small floating panel anywhere in
// the app, draw on the screen in red, write what is wrong and send it. The API stores the note with its
// screenshot and emails it to QA_REPORT_TO, where it is reviewed later (by people or agents). These are the
// rules both sides share: who may send one, how large it may be and what describes the page it came from.
import { z } from "zod";

import { MB } from "./uploads";

/** Sign-in addresses at this domain are todoi's own people. */
export const STAFF_EMAIL_DOMAIN = "todoi.com";
export const isStaffEmail = (email: string | null | undefined) => !!email && email.trim().toLowerCase().endsWith(`@${STAFF_EMAIL_DOMAIN}`);

export const MAX_QA_TEXT = 5000;
/** A PNG of one viewport at twice its size is 0.3–2 MB; a 5K display stays well under this. */
export const MAX_QA_SCREENSHOT_BYTES = 12 * MB;
export const MAX_QA_REQUEST_BYTES = MAX_QA_SCREENSHOT_BYTES + MB;
/** The context as JSON, at most: every field is capped, this bounds them together */
export const MAX_QA_CONTEXT_CHARS = 64_000;
/** Elements the drawing touches, at most */
export const MAX_QA_MARKED = 12;

const short = (max: number) => z.string().max(max);
const size = z.object({ width: z.number().finite(), height: z.number().finite() });

/** An element under the drawing: enough for a reviewer to find it in the code. */
export const qaMarkedSchema = z.object({
  /** tag, id, td-* classes, role and test id, innermost last: "div.td-card > button.td-btn" */
  selector: short(300),
  /** Its accessible name, when it has one */
  label: short(120).optional(),
  /** The start of its text */
  text: short(120).optional(),
  /** x, y, width, height in the viewport */
  rect: z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()]),
});
export type QaMarked = z.infer<typeof qaMarkedSchema>;

/** Where and in what a note was written, collected by the browser when it is sent. */
export const qaContextSchema = z.object({
  url: short(2000),
  title: short(300),
  userAgent: short(600),
  language: short(40),
  timeZone: short(80),
  /** The browser's clock (ISO); the server's own time is the note's `createdAt` */
  sentAt: short(40),
  viewport: size.extend({ dpr: z.number().finite() }),
  screen: size,
  /** <html data-*>: theme, mode, device, touch and the appearance options */
  appearance: z.record(short(40), short(80)),
  build: z.object({ sha: short(80), builtAt: short(40).nullable() }),
  online: z.boolean(),
  /** Pencil strokes in the screenshot */
  strokes: z.number().int().min(0).max(10_000),
  marked: z.array(qaMarkedSchema).max(MAX_QA_MARKED),
  /** Errors this page load reported to error tracking ("TypeError: …") */
  errors: z.array(short(600)).max(20),
  /**
   * How the screenshot went. `dom`: the page re-rendered from its DOM (the default, no prompt); `screen`: the
   * tab's real pixels through the browser's screen-sharing prompt ("Exact capture"). When neither worked
   * the image holds the strokes alone.
   */
  capture: z.object({ ok: z.boolean(), ms: z.number().finite(), method: z.enum(["dom", "screen"]).optional(), error: short(300).optional() }),
});
export type QaContext = z.infer<typeof qaContextSchema>;

/** Which deployment a note came from, by the app's address. */
export type QaEnvironment = "local" | "staging" | "live";
export function qaEnvironment(appUrl: string): QaEnvironment {
  let host = "";
  try {
    host = new URL(appUrl).hostname;
  } catch {
    /* not a URL: treated as live */
  }
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".local")) return "local";
  return host.startsWith("staging.") ? "staging" : "live";
}

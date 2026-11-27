// How an email leaves: Resend's REST API (POST https://api.resend.com/emails, no SDK) when a key is
// configured; otherwise a development transport that writes the message to a folder (.html, .txt and
// a .json of its headers, attachments beside them) and logs one line, so links can be opened locally and
// by the e2e tests.
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { nanoid } from "nanoid";

import type { RenderedEmail } from "./templates";

export interface EmailAttachment {
  /** As the recipient sees it; letters, digits, dots and dashes */
  filename: string;
  content: Uint8Array;
  contentType?: string;
}
export interface OutgoingEmail extends RenderedEmail {
  to: string;
  /** Replies go here instead of EMAIL_REPLY_TO (a QA note answers to the person who wrote it) */
  replyTo?: string;
  attachments?: EmailAttachment[];
}
export interface MailerConfig {
  RESEND_API_KEY?: string;
  EMAIL_FROM: string;
  /** Reply-To header, so replies to the no-reply sender reach a person */
  EMAIL_REPLY_TO?: string;
  EMAIL_DIR: string;
}
export type SendEmail = (email: OutgoingEmail) => Promise<void>;

const RESEND_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;
/** An email carrying files uploads megabytes first. */
const ATTACHMENT_TIMEOUT_MS = 60_000;

/** A Resend refusal or an unreachable API, worded for the person ("Couldn't send the link: …"). */
export class EmailNotSent extends Error {}

/** "2026-11-25T10-12-03-120Z-reset-your-todoi-password-x1y2z3": sortable, readable, never clashing. */
const fileStem = (subject: string, at: Date) => `${at.toISOString().replace(/[:.]/g, "-")}-${subject.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48)}-${nanoid(6)}`;

export function createMailer(config: MailerConfig, deps: { fetch?: typeof fetch; log?: (line: string) => void; now?: () => Date } = {}): SendEmail {
  const log = deps.log ?? ((line: string) => console.info(line));
  const now = deps.now ?? (() => new Date());
  if (config.RESEND_API_KEY) {
    const key = config.RESEND_API_KEY;
    const post = deps.fetch ?? fetch;
    return async ({ to, subject, html, text, replyTo, attachments }) => {
      let res: Response;
      try {
        res = await post(RESEND_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: config.EMAIL_FROM,
            reply_to: replyTo ?? config.EMAIL_REPLY_TO,
            to: [to],
            subject,
            html,
            text,
            // Resend takes each file's bytes as base64.
            ...(attachments?.length ? { attachments: attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString("base64"), content_type: a.contentType })) } : {}),
          }),
          signal: AbortSignal.timeout(attachments?.length ? ATTACHMENT_TIMEOUT_MS : TIMEOUT_MS),
        });
      } catch {
        throw new EmailNotSent("the mail service didn't answer");
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        // The reason is logged for the operator; the person gets a short one.
        console.error(`Resend refused an email (${res.status}): ${body?.message ?? res.statusText}`);
        throw new EmailNotSent(res.status === 429 ? "too many emails at once, try again in a minute" : "the mail service refused it");
      }
    };
  }
  return async ({ to, subject, html, text, replyTo, attachments = [] }) => {
    const at = now();
    const stem = join(config.EMAIL_DIR, fileStem(subject, at));
    await mkdir(config.EMAIL_DIR, { recursive: true });
    await Promise.all([
      writeFile(`${stem}.html`, html),
      writeFile(`${stem}.txt`, text),
      writeFile(`${stem}.json`, `${JSON.stringify({ from: config.EMAIL_FROM, replyTo: replyTo ?? config.EMAIL_REPLY_TO, to, subject, date: at.toISOString(), ...(attachments.length ? { attachments: attachments.map((a) => a.filename) } : {}) }, null, 2)}\n`),
      ...attachments.map((a) => writeFile(`${stem}.${a.filename}`, a.content)),
    ]);
    log(`Email to ${to} · ${subject} → ${stem}.html (RESEND_API_KEY is unset, so it was not sent)`);
  };
}

export interface WrittenEmail {
  to: string;
  subject: string;
  date: string;
  /** The first link into the app in the text part (confirm, reset, invite, the item), if any */
  link: string | null;
}

/**
 * The newest emails the development transport wrote to `dir`, for the operator console's outbox: while
 * RESEND_API_KEY is unset an operator hands a tester the confirmation, reset or invite link by hand.
 */
export async function writtenEmails(dir: string, appUrl: string, limit = 30): Promise<WrittenEmail[]> {
  const names = (await readdir(dir).catch(() => [] as string[])).filter((n) => n.endsWith(".json")).sort().reverse().slice(0, limit);
  const origin = appUrl.replace(/\/$/, "");
  return Promise.all(
    names.map(async (name) => {
      const stem = join(dir, name.slice(0, -".json".length));
      const head = JSON.parse(await readFile(`${stem}.json`, "utf8")) as { to: string; subject: string; date: string };
      const text = await readFile(`${stem}.txt`, "utf8").catch(() => "");
      const link = text.split(/\s+/).find((word) => word.startsWith(origin)) ?? null;
      return { to: head.to, subject: head.subject, date: head.date, link };
    }),
  );
}

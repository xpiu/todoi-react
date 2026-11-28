// QA notes (shared/qa.ts): who may send one, storing it with its screenshot, and the email that carries it
// to QA_REPORT_TO. The note is stored before anything is sent, so a mail outage never loses one: the job
// (jobKinds.ts › "qa-report-email") retries, and the stored copy stays readable by todoi's own people.
// The screenshot, the heavy part, is deleted after QA_SCREENSHOT_RETENTION_YEARS; the note itself is kept.
import { and, eq, isNotNull, lt, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { BUILD } from "../../shared/build";
import { isStaffEmail, qaEnvironment, type QaContext } from "../../shared/qa";
import { db } from "../db";
import { qaReports, uploadCleanup, type QaReport } from "../db/schema";
import { qaReportEmail, qaScreenshotName, sendEmail } from "../email";
import { env } from "../env";
import { emailConfirmed } from "./confirmedEmail";
import { readUpload, saveUpload } from "./uploads";

/** todoi's own people: a registered account whose confirmed address is at the staff domain. */
export async function isStaff(viewer: { userId: string; email: string; isAnonymous?: boolean } | null | undefined): Promise<boolean> {
  if (!viewer || viewer.isAnonymous || !isStaffEmail(viewer.email)) return false;
  // Confirmed in the database: anyone can sign up with an address they don't own, nobody can confirm it.
  return emailConfirmed(viewer.userId);
}

/** Where a note's stored screenshot is served (to staff only). */
export const qaScreenshotUrl = (id: string) => `${env.APP_URL.replace(/\/$/, "")}/api/qa-reports/${id}/screenshot`;

export async function createQaReport(author: { userId: string; email: string; name: string }, note: { text: string; context: QaContext; screenshot: Uint8Array | null }): Promise<QaReport> {
  const screenshotKey = note.screenshot ? await saveUpload(note.screenshot) : null;
  const [row] = await db
    .insert(qaReports)
    .values({ id: nanoid(), userId: author.userId, email: author.email, name: author.name, text: note.text, url: note.context.url, context: note.context, screenshotKey, screenshotSize: note.screenshot?.byteLength ?? 0 })
    .returning();
  return row!;
}

/** How long a note's screenshot is kept. Everything else about the note stays for good. */
export const QA_SCREENSHOT_RETENTION_YEARS = 2;

/**
 * Let go of the screenshots of notes older than the retention (with the Trash purge). The note keeps its
 * text, page, context and the size its screenshot had; the bytes leave through the upload cleanup queue,
 * in the same transaction, so a file is never orphaned and a failed removal is retried.
 */
export async function purgeOldQaScreenshots(years = QA_SCREENSHOT_RETENTION_YEARS): Promise<number> {
  return db.transaction(async (tx) => {
    const old = await tx
      .select({ id: qaReports.id, key: qaReports.screenshotKey })
      .from(qaReports)
      .where(and(isNotNull(qaReports.screenshotKey), lt(qaReports.createdAt, sql`now() - ${years} * interval '1 year'`)))
      .limit(500)
      .for("update", { skipLocked: true });
    for (const note of old) {
      await tx.insert(uploadCleanup).values({ storageKey: note.key! }).onConflictDoNothing();
      await tx.update(qaReports).set({ screenshotKey: null }).where(eq(qaReports.id, note.id));
    }
    return old.length;
  });
}

/** Email one stored note. Throws when the mail service refuses, so its job retries; a note already sent or gone is done. */
export async function deliverQaReport(id: string): Promise<void> {
  const [row] = await db.select().from(qaReports).where(eq(qaReports.id, id));
  if (!row || row.emailedAt) return;
  const bytes = row.screenshotKey ? await readUpload(row.screenshotKey) : null;
  const filename = qaScreenshotName(row.id, row.createdAt);
  const email = qaReportEmail({
    id: row.id,
    text: row.text,
    name: row.name,
    email: row.email,
    createdAt: row.createdAt,
    environment: qaEnvironment(env.APP_URL),
    appUrl: env.APP_URL,
    serverSha: BUILD.sha,
    context: row.context,
    screenshot: bytes ? { filename, url: qaScreenshotUrl(row.id), bytes: bytes.byteLength } : null,
  });
  await sendEmail({ ...email, to: env.QA_REPORT_TO, replyTo: row.email, attachments: bytes ? [{ filename, content: bytes, contentType: "image/png" }] : [] });
  await db.update(qaReports).set({ emailedAt: new Date() }).where(eq(qaReports.id, id));
}

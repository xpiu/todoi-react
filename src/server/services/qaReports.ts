// QA notes (shared/qa.ts): who may send one, storing it with its screenshot, and the email that carries it
// to QA_REPORT_TO. The note is stored before anything is sent, so a mail outage never loses one: the job
// (jobKinds.ts › "qa-report-email") retries, and the stored copy stays readable by todoi's own people.
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { BUILD } from "../../shared/build";
import { isStaffEmail, qaEnvironment, type QaContext } from "../../shared/qa";
import { db } from "../db";
import { qaReports, type QaReport } from "../db/schema";
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

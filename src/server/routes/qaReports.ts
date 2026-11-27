// QA notes (shared/qa.ts). todoi's own people send one (multipart: the text, the page's context as JSON and
// the screenshot). They and the operators (the console lists the notes) read back what was stored — the
// list, one note, its screenshot — and mark a note resolved once it is dealt with.
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { Hono, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";

import { isStaffEmail, MAX_QA_CONTEXT_CHARS, MAX_QA_REQUEST_BYTES, MAX_QA_SCREENSHOT_BYTES, MAX_QA_TEXT, qaContextSchema } from "../../shared/qa";
import { MB } from "../../shared/uploads";
import { maybeViewer, viewerOf } from "../auth";
import { db } from "../db";
import { qaReports, type QaReport } from "../db/schema";
import { qaScreenshotName } from "../email";
import { fail, idParam } from "../errors";
import { enqueueQaReportEmail } from "../jobKinds";
import { attachmentHeaders, previewType } from "../services/attachmentResponse";
import { requireConfirmedEmail } from "../services/confirmedEmail";
import { createQaReport, isStaff } from "../services/qaReports";
import { isOperator } from "./admin";
import { openUpload } from "../services/uploads";

const REFUSAL = "QA notes are for todoi's own people";
const staffOnly: MiddlewareHandler = async (c, next) => {
  const viewer = maybeViewer(c);
  if (!viewer || viewer.isAnonymous || !isStaffEmail(viewer.email)) return fail(c, 403, REFUSAL);
  // One of ours who hasn't opened the confirmation link yet: say that, so the tool can send it again.
  await requireConfirmedEmail(viewer, "send QA notes");
  await next();
};
/** Reading and resolving: the people who write the notes, and the operators whose console lists them. */
const readers: MiddlewareHandler = async (c, next) => {
  const viewer = maybeViewer(c);
  if (!(await isStaff(viewer)) && !(await isOperator(viewer))) return fail(c, 403, REFUSAL);
  await next();
};

const summary = (r: QaReport) => ({
  id: r.id,
  createdAt: r.createdAt.toISOString(),
  emailedAt: r.emailedAt?.toISOString() ?? null,
  resolvedAt: r.resolvedAt?.toISOString() ?? null,
  email: r.email,
  name: r.name,
  text: r.text,
  url: r.url,
  marked: r.context.marked.map((m) => m.selector),
  screenshot: r.screenshotKey ? `/api/qa-reports/${r.id}/screenshot` : null,
});

export const qaReportsRoute = new Hono()
  // Open notes first, then the newest.
  .get("/", readers, async (c) => c.json((await db.select().from(qaReports).orderBy(sql`${qaReports.resolvedAt} is not null`, desc(qaReports.createdAt)).limit(100)).map(summary)))
  // The size bound applies before the body is read, so an oversized request is never buffered.
  .post("/", staffOnly, bodyLimit({ maxSize: MAX_QA_REQUEST_BYTES, onError: (c) => fail(c, 413, `A QA screenshot can be up to ${MAX_QA_SCREENSHOT_BYTES / MB} MB`) }), async (c) => {
    const viewer = viewerOf(c);
    const body = await c.req.parseBody();
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (text.length > MAX_QA_TEXT) return fail(c, 400, `A QA note can be up to ${MAX_QA_TEXT} characters`, { fields: { text: "Too long" } });
    let raw: unknown = null;
    try {
      raw = JSON.parse(typeof body.context === "string" && body.context.length <= MAX_QA_CONTEXT_CHARS ? body.context : "");
    } catch {
      /* reported below: not the context this route needs */
    }
    const context = qaContextSchema.safeParse(raw);
    if (!context.success) return fail(c, 400, "This QA note doesn't say which page it is about", { fields: { context: context.error.issues[0]?.path.join(".") || "context" } });
    const file = body.screenshot instanceof File ? body.screenshot : null;
    if (file && file.size > MAX_QA_SCREENSHOT_BYTES) return fail(c, 413, `A QA screenshot can be up to ${MAX_QA_SCREENSHOT_BYTES / MB} MB`);
    const screenshot = file ? new Uint8Array(await file.arrayBuffer()) : null;
    // By its bytes, never by what the upload calls itself.
    if (screenshot && previewType(screenshot) !== "image/png") return fail(c, 400, "The screenshot must be a PNG image");
    if (!text && !context.data.strokes) return fail(c, 400, "Write what is wrong, or draw on the screen", { fields: { text: "Required" } });
    const row = await createQaReport({ userId: viewer.userId, email: viewer.email, name: viewer.name }, { text, context: context.data, screenshot });
    await enqueueQaReportEmail(row.id);
    return c.json(summary(row), 201);
  })
  .post("/:id/resolve", readers, idParam, async (c) => {
    const [row] = await db.update(qaReports).set({ resolvedAt: new Date() }).where(and(eq(qaReports.id, c.req.valid("param").id), isNull(qaReports.resolvedAt))).returning({ id: qaReports.id });
    return row ? c.body(null, 204) : fail(c, 404, "Not found");
  })
  .get("/:id", readers, idParam, async (c) => {
    const [row] = await db.select().from(qaReports).where(eq(qaReports.id, c.req.valid("param").id));
    return row ? c.json({ ...summary(row), context: row.context }) : fail(c, 404, "Not found");
  })
  .get("/:id/screenshot", readers, idParam, async (c) => {
    const [row] = await db.select().from(qaReports).where(eq(qaReports.id, c.req.valid("param").id));
    const file = row?.screenshotKey ? await openUpload(row.screenshotKey) : null;
    if (!row || !file) return fail(c, 404, "Not found");
    return c.body(file.stream, 200, attachmentHeaders(file.head, file.size, qaScreenshotName(row.id, row.createdAt), c.req.query("download") != null));
  });

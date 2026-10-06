// Attachments: files on an item; the bytes go through services/uploads. Spec: DESIGN.md › Attachments.
import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";

import { idSchema } from "../../shared/items";
import { MAX_ATTACHMENT_BYTES, MAX_UPLOAD_REQUEST_BYTES, MB } from "../../shared/uploads";
import { viewerOf } from "../auth";
import { afterCommit, db } from "../db";
import { attachments, items } from "../db/schema";
import { attachmentHeaders } from "../services/attachmentResponse";
import { safeName, storeAttachments, UploadRejected } from "../services/attachments";
import { openUpload } from "../services/uploads";
import { drainUploadCleanup } from "../services/uploadCleanup";
import { fail, validate } from "../errors";

const idParam = validate("param", z.object({ id: z.string().min(1).max(64) }));

export const itemAttachmentsRoute = new Hono()
  .get("/:id/attachments", idParam, async (c) => {
    const rows = await db.select().from(attachments).where(eq(attachments.itemId, c.req.valid("param").id)).orderBy(asc(attachments.createdAt));
    return c.json(rows);
  })
  // multipart/form-data with one or more `files`; all are attached or none. The size bound applies
  // before the body is read, so an oversized request is never buffered.
  .post(
    "/:id/attachments",
    idParam,
    bodyLimit({ maxSize: MAX_UPLOAD_REQUEST_BYTES, onError: (c) => fail(c, 413, `Uploads are limited to ${MAX_ATTACHMENT_BYTES / MB} MB per file`) }),
    async (c) => {
      const { id } = c.req.valid("param");
      const viewer = viewerOf(c);
      const [item] = await db.select().from(items).where(eq(items.id, id));
      if (!item) return fail(c, 404, "Not found");
      const body = await c.req.parseBody({ all: true });
      const raw = body["files"] ?? body["file"];
      const files = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter((f): f is File => f instanceof File);
      try {
        return c.json(await storeAttachments(item, files, viewer), 201);
      } catch (error) {
        if (error instanceof UploadRejected) return fail(c, error.status, error.message);
        throw error;
      }
    },
  );

export const attachmentsRoute = new Hono()
  .get("/:id/file", idParam, async (c) => {
    const [row] = await db.select().from(attachments).where(eq(attachments.id, c.req.valid("param").id));
    if (!row) return fail(c, 404, "Not found");
    const file = await openUpload(row.storageKey);
    if (!file) return fail(c, 404, "File missing");
    const download = c.req.query("download") != null;
    return c.body(file.stream, 200, attachmentHeaders(file.head, file.size, row.name, download));
  })
  .patch("/:id", idParam, validate("json", z.object({ name: z.string().trim().min(1).max(200) })), async (c) => {
    const [row] = await db.update(attachments).set({ name: safeName(c.req.valid("json").name) }).where(eq(attachments.id, c.req.valid("param").id)).returning();
    return row ? c.json(row) : fail(c, 404, "Not found");
  })
  .delete("/:id", idParam, async (c) => {
    const row = await db.transaction(async (tx) => {
      const [removed] = await tx.delete(attachments).where(eq(attachments.id, c.req.valid("param").id)).returning();
      if (!removed) return;
      const [item] = await tx.select({ id: items.id, cover: items.cover }).from(items).where(eq(items.id, removed.itemId));
      if (item?.cover?.attachmentId === removed.id) await tx.update(items).set({ cover: null }).where(eq(items.id, item.id));
      return removed;
    });
    if (!row) return fail(c, 404, "Not found");
    await afterCommit(drainUploadCleanup);
    return c.body(null, 204);
  });

export const attachmentIdSchema = idSchema;

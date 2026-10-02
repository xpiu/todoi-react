// Attachments: files on an item; the bytes go through services/uploads. Spec: DESIGN.md › Attachments.
import { zValidator } from "@hono/zod-validator";
import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";

import { idSchema } from "../../shared/items";
import { MAX_ATTACHMENT_BYTES, MAX_UPLOAD_REQUEST_BYTES, MB } from "../../shared/uploads";
import { viewerOf } from "../auth";
import { db } from "../db";
import { attachments, items } from "../db/schema";
import { attachmentHeaders } from "../services/attachmentResponse";
import { safeName, storeAttachments, UploadRejected } from "../services/attachments";
import { openUpload } from "../services/uploads";
import { drainUploadCleanup } from "../services/uploadCleanup";

const idParam = zValidator("param", z.object({ id: z.string().min(1).max(64) }));

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
    bodyLimit({ maxSize: MAX_UPLOAD_REQUEST_BYTES, onError: (c) => c.json({ error: `Uploads are limited to ${MAX_ATTACHMENT_BYTES / MB} MB per file` }, 413) }),
    async (c) => {
      const { id } = c.req.valid("param");
      const viewer = viewerOf(c);
      const [item] = await db.select().from(items).where(eq(items.id, id));
      if (!item) return c.json({ error: "Not found" }, 404);
      const body = await c.req.parseBody({ all: true });
      const raw = body["files"] ?? body["file"];
      const files = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter((f): f is File => f instanceof File);
      try {
        return c.json(await storeAttachments(item, files, viewer), 201);
      } catch (error) {
        if (error instanceof UploadRejected) return c.json({ error: error.message }, error.status);
        throw error;
      }
    },
  );

export const attachmentsRoute = new Hono()
  .get("/:id/file", idParam, async (c) => {
    const [row] = await db.select().from(attachments).where(eq(attachments.id, c.req.valid("param").id));
    if (!row) return c.json({ error: "Not found" }, 404);
    const file = await openUpload(row.storageKey);
    if (!file) return c.json({ error: "File missing" }, 404);
    const download = c.req.query("download") != null;
    return c.body(file.stream, 200, attachmentHeaders(file.head, file.size, row.name, download));
  })
  .patch("/:id", idParam, zValidator("json", z.object({ name: z.string().trim().min(1).max(200) })), async (c) => {
    const [row] = await db.update(attachments).set({ name: safeName(c.req.valid("json").name) }).where(eq(attachments.id, c.req.valid("param").id)).returning();
    return row ? c.json(row) : c.json({ error: "Not found" }, 404);
  })
  .delete("/:id", idParam, async (c) => {
    const row = await db.transaction(async (tx) => {
      const [removed] = await tx.delete(attachments).where(eq(attachments.id, c.req.valid("param").id)).returning();
      if (!removed) return;
      const [item] = await tx.select({ id: items.id, cover: items.cover }).from(items).where(eq(items.id, removed.itemId));
      if (item?.cover?.attachmentId === removed.id) await tx.update(items).set({ cover: null }).where(eq(items.id, item.id));
      return removed;
    });
    if (!row) return c.json({ error: "Not found" }, 404);
    await drainUploadCleanup();
    return c.body(null, 204);
  });

export const attachmentIdSchema = idSchema;

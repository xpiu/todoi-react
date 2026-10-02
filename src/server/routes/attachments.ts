// Attachments: files on an item; the bytes go through services/uploads. Spec: DESIGN.md › Attachments.
import { zValidator } from "@hono/zod-validator";
import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { nanoid } from "nanoid";
import { z } from "zod";

import { idSchema } from "../../shared/items";
import { viewerOf } from "../auth";
import { db } from "../db";
import { attachments, items } from "../db/schema";
import { logActivity, quote } from "../services/activity";
import { attachmentHeaders } from "../services/attachmentResponse";
import { readUpload, saveUpload } from "../services/uploads";
import { drainUploadCleanup } from "../services/uploadCleanup";

const idParam = zValidator("param", z.object({ id: z.string().min(1).max(64) }));
const MAX_BYTES = 25 * 1024 * 1024;
export const safeName = (n: string) => n.replace(/[\\/]/g, "_").slice(0, 200) || "file";

export const itemAttachmentsRoute = new Hono()
  .get("/:id/attachments", idParam, async (c) => {
    const rows = await db.select().from(attachments).where(eq(attachments.itemId, c.req.valid("param").id)).orderBy(asc(attachments.createdAt));
    return c.json(rows);
  })
  // multipart/form-data with one or more `files`
  .post("/:id/attachments", idParam, async (c) => {
    const { id } = c.req.valid("param");
    const viewer = viewerOf(c);
    const [item] = await db.select().from(items).where(eq(items.id, id));
    if (!item) return c.json({ error: "Not found" }, 404);
    const body = await c.req.parseBody({ all: true });
    const raw = body["files"] ?? body["file"];
    const files = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter((f): f is File => f instanceof File);
    if (!files.length) return c.json({ error: "No files" }, 400);
    const made = [];
    for (const f of files) {
      if (f.size > MAX_BYTES) return c.json({ error: `${f.name} is larger than 25 MB` }, 413);
      const storageKey = await saveUpload(new Uint8Array(await f.arrayBuffer()));
      const [row] = await db
        .insert(attachments)
        .values({ id: nanoid(), itemId: id, name: safeName(f.name), size: f.size, mime: f.type || null, storageKey, uploadedBy: viewer.userId })
        .returning();
      made.push(row!);
    }
    await logActivity(db, { projectId: item.projectId, actorId: viewer.userId, type: "item", text: `attached ${made.length === 1 ? quote(made[0]!.name) : `${made.length} files`} to ${quote(item.title)}`, itemId: id });
    return c.json(made, 201);
  });

export const attachmentsRoute = new Hono()
  .get("/:id/file", idParam, async (c) => {
    const [row] = await db.select().from(attachments).where(eq(attachments.id, c.req.valid("param").id));
    if (!row) return c.json({ error: "Not found" }, 404);
    const bytes = await readUpload(row.storageKey);
    if (!bytes) return c.json({ error: "File missing" }, 404);
    const download = c.req.query("download") != null;
    return c.body(bytes, 200, attachmentHeaders(bytes, row.name, download));
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

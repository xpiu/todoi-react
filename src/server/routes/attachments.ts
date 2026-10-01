// Attachments: files on an item. Bytes live on local disk under UPLOAD_DIR (an object store is a
// later swap: only `storageKey` and the two file helpers change). Spec: DESIGN.md › Attachments.
import { zValidator } from "@hono/zod-validator";
import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { nanoid } from "nanoid";
import { join } from "node:path";
import { z } from "zod";

import { idSchema } from "../../shared/items";
import { viewerOf } from "../auth";
import { db } from "../db";
import { attachments, items } from "../db/schema";
import { env } from "../env";
import { logActivity, quote } from "../services/activity";

const idParam = zValidator("param", z.object({ id: z.string().min(1).max(64) }));
const MAX_BYTES = 25 * 1024 * 1024;
const safeName = (n: string) => n.replace(/[\\/]/g, "_").slice(0, 200) || "file";
const pathOf = (storageKey: string) => join(env.UPLOAD_DIR, storageKey);

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
    await mkdir(env.UPLOAD_DIR, { recursive: true });
    const made = [];
    for (const f of files) {
      if (f.size > MAX_BYTES) return c.json({ error: `${f.name} is larger than 25 MB` }, 413);
      const storageKey = nanoid();
      await writeFile(pathOf(storageKey), Buffer.from(await f.arrayBuffer()));
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
    const bytes = await readFile(pathOf(row.storageKey)).catch(() => null);
    if (!bytes) return c.json({ error: "File missing" }, 404);
    const download = c.req.query("download") != null;
    return c.body(bytes, 200, {
      "Content-Type": row.mime ?? "application/octet-stream",
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, max-age=31536000, immutable",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(row.name)}`,
    });
  })
  .patch("/:id", idParam, zValidator("json", z.object({ name: z.string().trim().min(1).max(200) })), async (c) => {
    const [row] = await db.update(attachments).set({ name: safeName(c.req.valid("json").name) }).where(eq(attachments.id, c.req.valid("param").id)).returning();
    return row ? c.json(row) : c.json({ error: "Not found" }, 404);
  })
  .delete("/:id", idParam, async (c) => {
    const [row] = await db.delete(attachments).where(eq(attachments.id, c.req.valid("param").id)).returning();
    if (!row) return c.json({ error: "Not found" }, 404);
    await rm(pathOf(row.storageKey), { force: true });
    // A cover that pointed at this file goes with it.
    const [item] = await db.select({ id: items.id, cover: items.cover }).from(items).where(eq(items.id, row.itemId));
    if (item?.cover?.attachmentId === row.id) await db.update(items).set({ cover: null }).where(eq(items.id, item.id));
    return c.body(null, 204);
  });

export const attachmentIdSchema = idSchema;

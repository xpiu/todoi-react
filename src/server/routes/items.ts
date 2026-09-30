import { zValidator } from "@hono/zod-validator";
import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import { createItemSchema, itemIdSchema, updateItemSchema } from "../../shared/items";
import { db } from "../db";
import { items } from "../db/schema";

const idParam = zValidator("param", z.object({ id: itemIdSchema }));

export const itemsRoute = new Hono()
  .get("/", async (c) => {
    const rows = await db.select().from(items).orderBy(asc(items.createdAt));
    return c.json(rows);
  })
  .post("/", zValidator("json", createItemSchema), async (c) => {
    const [row] = await db.insert(items).values(c.req.valid("json")).returning();
    return c.json(row!, 201);
  })
  .patch("/:id", idParam, zValidator("json", updateItemSchema), async (c) => {
    const [row] = await db
      .update(items)
      .set(c.req.valid("json"))
      .where(eq(items.id, c.req.valid("param").id))
      .returning();
    return row ? c.json(row) : c.notFound();
  })
  .delete("/:id", idParam, async (c) => {
    const [row] = await db
      .delete(items)
      .where(eq(items.id, c.req.valid("param").id))
      .returning({ id: items.id });
    return row ? c.body(null, 204) : c.notFound();
  });

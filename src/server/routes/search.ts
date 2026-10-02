import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";

import { viewerOf } from "../auth";
import { SEARCH_LIMIT, searchItems } from "../services/search";

// GET /api/search?q= — the viewer's own items only (member projects + Inbox); see services/search.
export const searchRoute = new Hono().get("/", zValidator("query", z.object({ q: z.string().max(200), limit: z.coerce.number().int().min(1).max(50).default(SEARCH_LIMIT) })), async (c) => {
  const { q, limit } = c.req.valid("query");
  return c.json(await searchItems(viewerOf(c), q, limit));
});

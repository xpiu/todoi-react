import { Hono } from "hono";
import { z } from "zod";

import { ITEM_STATUSES } from "../../shared/item-status";
import { viewerOf } from "../auth";
import { FULL_SEARCH_PAGE, SEARCH_LIMIT, fullSearch, searchItems } from "../services/search";
import { validate } from "../errors";

// GET /api/search?q= — the viewer's own items only (member projects + Inbox); see services/search.
// GET /api/search/full?q=&projectId=&status=&assignee=&archived=&offset=&limit= — the Search page:
// titles, descriptions and comments, one hit per item with its best match, and the total.
export const searchRoute = new Hono()
  .get("/", validate("query", z.object({ q: z.string().max(200), limit: z.coerce.number().int().min(1).max(50).default(SEARCH_LIMIT) })), async (c) => {
    const { q, limit } = c.req.valid("query");
    return c.json(await searchItems(viewerOf(c), q, limit));
  })
  .get(
    "/full",
    validate(
      "query",
      z.object({
        q: z.string().max(200),
        projectId: z.string().max(64).optional(),
        status: z.enum(ITEM_STATUSES).optional(),
        /** A user id, or "none" for unassigned */
        assignee: z.string().max(64).optional(),
        archived: z.enum(["true", "false"]).optional(),
        offset: z.coerce.number().int().min(0).max(10_000).default(0),
        limit: z.coerce.number().int().min(1).max(50).default(FULL_SEARCH_PAGE),
      }),
    ),
    async (c) => {
      const { q, offset, limit, archived, ...filters } = c.req.valid("query");
      return c.json(await fullSearch(viewerOf(c), q, { ...filters, archived: archived === "true" }, offset, limit));
    },
  );

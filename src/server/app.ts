import { Hono } from "hono";
import { logger } from "hono/logger";

import { itemsRoute } from "./routes/items";

// Chained so Hono can infer the full route type for the RPC client (`hc<AppType>`).
export const app = new Hono()
  .use(logger())
  .basePath("/api")
  .get("/health", (c) => c.json({ ok: true }))
  .route("/items", itemsRoute);

export type AppType = typeof app;

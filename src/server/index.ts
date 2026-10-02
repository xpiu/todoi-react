import { existsSync } from "node:fs";
import { join } from "node:path";

import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Hono } from "hono";

import { app } from "./app";
import { db } from "./db";
import { env } from "./env";
import { notFound, onError } from "./errors";
import { seedIfEmpty } from "./seed";
import { drainUploadCleanup } from "./services/uploadCleanup";

// Development runs pending migrations on boot so the API and the schema never drift; production
// applies them explicitly with `npm run db:migrate` (or sets MIGRATE_ON_START=true).
if (env.MIGRATE_ON_START) {
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations applied");
}
if (env.SEED_ON_START) await seedIfEmpty();
void drainUploadCleanup();
const cleanup = setInterval(() => void drainUploadCleanup(), 60_000);
cleanup.unref();

// The API under /api; in production also the built client (CLIENT_DIR), with every other path answered
// by index.html so a deep link (/p/…, /inbox) opens the app. Development serves the client with Vite.
const server = new Hono().route("/", app);
const isApi = (path: string) => path === "/api" || path.startsWith("/api/");
if (env.CLIENT_DIR) {
  const index = join(env.CLIENT_DIR, "index.html");
  if (!existsSync(index)) {
    console.error(`Todoi can't start: ${index} is missing. Run \`npm run build\` first, or set CLIENT_DIR= to serve the API only.`);
    process.exit(1);
  }
  // Hashed build assets never change; index.html and deep links revalidate so a deploy shows at once.
  const files = serveStatic({ root: env.CLIENT_DIR, onFound: (path, c) => c.header("Cache-Control", path.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache") });
  const page = serveStatic({ path: index, onFound: (_path, c) => c.header("Cache-Control", "no-cache") });
  server.use("*", (c, next) => (isApi(c.req.path) ? next() : files(c, next)));
  server.get("*", (c, next) => (isApi(c.req.path) ? next() : page(c, next)));
}
server.onError(onError).notFound(notFound);

const http = serve({ fetch: server.fetch, port: env.PORT }, (info) => {
  console.log(`API listening on http://localhost:${info.port}/api${env.CLIENT_DIR ? ` (serving ${env.CLIENT_DIR}/)` : ""}`);
});

// A deploy or restart sends SIGTERM: stop taking connections, let open requests finish, close the pool.
let closing = false;
function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  console.log(`${signal}: finishing open requests, then exiting`);
  clearInterval(cleanup);
  setTimeout(() => {
    console.error("Shutdown took longer than 10s; exiting anyway");
    process.exit(1);
  }, 10_000).unref();
  http.close(() => void db.$client.end().finally(() => process.exit(0)));
}
process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));

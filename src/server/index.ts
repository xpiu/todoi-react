import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Hono } from "hono";

import { app } from "./app";
import { routePath } from "./apiV1";
import { contentSecurityPolicy, cspHeader } from "./csp";
import { db } from "./db";
import { env } from "./env";
import { notFound, onError } from "./errors";
import { startJobs } from "./jobKinds";
import { seedIfEmpty } from "./seed";

// Development runs pending migrations on boot so the API and the schema never drift; production
// applies them explicitly with `npm run db:migrate` (or sets MIGRATE_ON_START=true).
if (env.MIGRATE_ON_START) {
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations applied");
}
if (env.SEED_ON_START) await seedIfEmpty();
// Background work (Git syncs, the Trash purge, upload cleanup, receipt pruning) runs on the durable job queue.
const stopJobs = await startJobs();

// The API under /api; in production also the built client (CLIENT_DIR), with every other path answered
// by index.html so a deep link (/p/…, /inbox) opens the app. Development serves the client with Vite.
const server = new Hono({ getPath: routePath });
// A deployment that isn't for search engines (staging; NOINDEX, on by default with SIGN_UP=invite) says so on every response.
if (env.NOINDEX) {
  server.use("*", async (c, next) => {
    await next();
    c.header("X-Robots-Tag", "noindex, nofollow");
  });
  server.get("/robots.txt", (c) => c.text("User-agent: *\nDisallow: /\n"));
}
server.route("/", app);
const isApi = (path: string) => path === "/api" || path.startsWith("/api/");
if (env.CLIENT_DIR) {
  const index = join(env.CLIENT_DIR, "index.html");
  if (!existsSync(index)) {
    console.error(`Todoi can't start: ${index} is missing. Run \`npm run build\` first, or set CLIENT_DIR= to serve the API only.`);
    process.exit(1);
  }
  // Every page the client serves carries the Content-Security-Policy (csp.ts; CSP=report-only only reports).
  const policy = contentSecurityPolicy(readFileSync(index, "utf8"));
  const header = cspHeader(env.CSP);
  server.use("*", async (c, next) => {
    await next();
    if (!isApi(c.req.path) && c.res.headers.get("Content-Type")?.startsWith("text/html")) c.header(header, policy);
  });
  // Hashed build assets never change; index.html and deep links revalidate so a deploy shows at once.
  const files = serveStatic({ root: env.CLIENT_DIR, onFound: (path, c) => c.header("Cache-Control", path.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache") });
  const page = serveStatic({ path: index, onFound: (_path, c) => c.header("Cache-Control", "no-cache") });
  // Markdown copies for agents (/docs/agents.md) read as text, not a download.
  server.use("*", async (c, next) => {
    if (isApi(c.req.path)) return next();
    const res = await files(c, next);
    if (res && c.req.path.endsWith(".md")) res.headers.set("Content-Type", "text/markdown; charset=utf-8");
    return res;
  });
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
  stopJobs();
  setTimeout(() => {
    console.error("Shutdown took longer than 10s; exiting anyway");
    process.exit(1);
  }, 10_000).unref();
  http.close(() => void db.$client.end().finally(() => process.exit(0)));
}
process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));

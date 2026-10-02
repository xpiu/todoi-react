import { serve } from "@hono/node-server";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { app } from "./app";
import { db } from "./db";
import { env } from "./env";
import { seedIfEmpty } from "./seed";
import { drainUploadCleanup } from "./services/uploadCleanup";

// Development runs pending migrations on boot so the API and the schema never drift; production
// applies them explicitly with `npm run db:migrate` (MIGRATE_ON_START=false).
if (env.MIGRATE_ON_START) {
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations applied");
}
if (env.SEED_ON_START) await seedIfEmpty();
void drainUploadCleanup();
setInterval(() => void drainUploadCleanup(), 60_000).unref();

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`API listening on http://localhost:${info.port}/api`);
});

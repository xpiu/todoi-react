// Before every browser run: the screenshot gates' workspace (GATE_USER) goes back to exactly what the seed
// makes, in the database the API under test uses (.env, as `npm run dev:api` reads it). The schema is
// migrated first, so a fresh database (CI's) works before the dev server has booted and migrated it.
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

export default async function globalSetup() {
  if (existsSync(".env")) loadEnvFile(".env");
  const { resetGateWorkspace } = await import("../../src/server/seed");
  const { db } = await import("../../src/server/db");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    await resetGateWorkspace();
  } finally {
    await db.$client.end();
  }
}

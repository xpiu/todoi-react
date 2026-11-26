// Before every browser run: the screenshot gates' workspace (GATE_USER) goes back to exactly what the seed
// makes, in the database the API under test uses (.env, as `npm run dev:api` reads it). The schema is
// migrated and the development sample seeded first (as the dev server does on boot), so a fresh database
// (CI's) has both before the dev server starts; the server's own seed then finds the samples in place.
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

export default async function globalSetup() {
  if (existsSync(".env")) loadEnvFile(".env");
  const { resetGateWorkspace, seedIfEmpty } = await import("../../src/server/seed");
  const { db } = await import("../../src/server/db");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    await seedIfEmpty();
    await resetGateWorkspace();
  } finally {
    await db.$client.end();
  }
}

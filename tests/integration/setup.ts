// Each integration-test file gets a disposable database and upload directory. Never modify app data.
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import { afterAll, vi } from "vitest";

const admin = new Client({ connectionString: process.env.DATABASE_URL });
await admin.connect();
const database = `todoi_test_${randomUUID().replaceAll("-", "")}`;
const uploadDir = await mkdtemp(join(tmpdir(), "todoi-uploads-"));
await admin.query(`CREATE DATABASE "${database}"`);
const connection = new URL(process.env.DATABASE_URL!);
connection.pathname = `/${database}`;
vi.stubEnv("DATABASE_URL", connection.toString());
vi.stubEnv("UPLOAD_DIR", uploadDir);
const { db } = await import("../../src/server/db");
afterAll(async () => {
  // pool.end() resolves once its clients are told to close, not once their sockets are gone; dropping the
  // database first terminates them mid-close (57P01) and the pool reports that as an uncaught error.
  const pool = db.$client;
  let open = pool.totalCount;
  const closed = new Promise<void>((resolve) => {
    if (!open) resolve();
    pool.on("remove", () => --open || resolve());
  });
  await pool.end();
  await closed;
  await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
  await admin.end();
  await rm(uploadDir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});
await migrate(db, { migrationsFolder: "./drizzle" });

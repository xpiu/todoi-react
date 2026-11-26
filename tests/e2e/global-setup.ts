// Before every browser run: the screenshot gates' workspace (GATE_USER) goes back to exactly what the seed
// makes, in the database the API under test uses (.env, as `npm run dev:api` reads it). Playwright starts
// the dev servers before this runs, and the API migrates and seeds as it boots (src/server/index.ts), so
// this waits until the API answers: touching a fresh database (CI's) earlier races that boot.
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";

const API = "http://localhost:5173/api/health";

async function apiReady(timeoutMs = 120_000) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const ok = await fetch(API).then((r) => r.ok, () => false);
    if (ok) return;
    if (Date.now() > until) throw new Error(`The API under test didn't answer ${API} within ${timeoutMs / 1000}s`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

export default async function globalSetup() {
  if (existsSync(".env")) loadEnvFile(".env");
  await apiReady();
  const { resetGateWorkspace } = await import("../../src/server/seed");
  const { db } = await import("../../src/server/db");
  try {
    await resetGateWorkspace();
  } finally {
    await db.$client.end();
  }
}

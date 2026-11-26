// Deploy rule (README › Deploys): once testers hold real data on staging, a migration that can lose data or
// refuse writes older clients replay from their outbox needs a human's look first. A new migration with such
// a step passes only with a `-- reviewed: <why it is safe>` line in its .sql file.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = join(import.meta.dirname, "../../../drizzle");
/** Migrations up to this one shipped before the rule (0001 tightened items.list_id, 0018 renamed a column) */
const LAST_BEFORE_RULE = 24;

const RISKY: [RegExp, string][] = [
  [/\bDROP\s+(TABLE|COLUMN|TYPE|SCHEMA)\b/i, "drops data"],
  [/\bRENAME\b/i, "renames (running code still uses the old name until the deploy finishes)"],
  [/\bSET\s+NOT\s+NULL\b/i, "tightens a column (existing rows and older clients' writes may be null)"],
  [/\bALTER\s+COLUMN\s+"?\w+"?\s+(SET\s+DATA\s+)?TYPE\b/i, "changes a column's type"],
  [/\bTRUNCATE\b|\bDELETE\s+FROM\b/i, "deletes rows"],
  [/\bADD\s+COLUMN\b(?![^;]*\bDEFAULT\b)[^;]*\bNOT\s+NULL\b/i, "adds a NOT NULL column without a default"],
];

function riskyStatements(sql: string): string[] {
  if (/^--\s*reviewed:\s*\S/im.test(sql)) return [];
  return sql
    .split(/;\s*(?:-->\s*statement-breakpoint)?/)
    .flatMap((statement) => RISKY.filter(([pattern]) => pattern.test(statement)).map(([, why]) => `${statement.trim().split("\n")[0]} — ${why}`));
}

describe("migrations", () => {
  it("flag the steps that can lose data, unless reviewed", () => {
    expect(riskyStatements(`ALTER TABLE "items" DROP COLUMN "x";--> statement-breakpoint\nCREATE INDEX "a" ON "items" ("b");`)).toEqual([`ALTER TABLE "items" DROP COLUMN "x" — drops data`]);
    expect(riskyStatements(`ALTER TABLE "items" ADD COLUMN "n" integer NOT NULL;`)).toHaveLength(1);
    expect(riskyStatements(`ALTER TABLE "items" ADD COLUMN "n" integer DEFAULT 0 NOT NULL;`)).toEqual([]);
    expect(riskyStatements(`-- reviewed: the column was never written\nALTER TABLE "items" DROP COLUMN "x";`)).toEqual([]);
  });

  it("added after the rule are additive or reviewed", () => {
    const journal = JSON.parse(readFileSync(join(DIR, "meta/_journal.json"), "utf8")) as { entries: { idx: number; tag: string }[] };
    const found = journal.entries
      .filter((e) => e.idx > LAST_BEFORE_RULE)
      .flatMap((e) => riskyStatements(readFileSync(join(DIR, `${e.tag}.sql`), "utf8")).map((s) => `${e.tag}: ${s}`));
    expect(found).toEqual([]);
  });
});

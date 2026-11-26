import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { app } from "../app";
import { db } from "../db";
import { errorGroups } from "../db/schema";

const post = (type: string, body: unknown) => app.request("/api/csp-reports", { method: "POST", headers: { "content-type": type }, body: typeof body === "string" ? body : JSON.stringify(body) });

describe("CSP reports", () => {
  it("records report-uri and Reporting API reports without a session, grouped by directive, origin and page", async () => {
    expect((await post("application/csp-report", { "csp-report": { "document-uri": "https://staging.todoi.com/p/AAAAAAAAAAAAAAAAAAAAA?v=board", "effective-directive": "script-src-elem", "blocked-uri": "https://cdn.example/x.js?y=1" } })).status).toBe(204);
    expect((await post("application/reports+json", [{ type: "csp-violation", body: { documentURL: "https://staging.todoi.com/p/BBBBBBBBBBBBBBBBBBBBB", effectiveDirective: "script-src-elem", blockedURL: "https://cdn.example/other.js" } }])).status).toBe(204);
    expect((await post("application/csp-report", "not json")).status).toBe(204);
    const rows = await db.select().from(errorGroups).where(eq(errorGroups.kind, "CSP"));
    expect(rows).toEqual([expect.objectContaining({ source: "client", message: "script-src-elem would block https://cdn.example", where: "/p/:id", count: 2 })]);
  });
});

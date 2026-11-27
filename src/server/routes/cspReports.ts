// POST /api/csp-reports: what the report-only Content-Security-Policy (src/server/csp.ts) would have
// blocked, from `report-uri` (application/csp-report) or the Reporting API (application/reports+json).
// Browsers send these without cookies, so the route sits before authentication, throttled per address.
import { Hono } from "hono";

import { pagePathGroup, recordError } from "../services/errorTracking";

type Report = Record<string, unknown>;

/** A blocked URL as its origin ("https://cdn.example"), or the keyword the browser gave ("inline", "eval") */
function blockedLabel(blocked: string): string {
  try {
    return new URL(blocked).origin;
  } catch {
    return blocked || "inline";
  }
}

/** The page's path, ids replaced so one problem stays one group */
function pagePath(page: string): string {
  try {
    return pagePathGroup(new URL(page).pathname);
  } catch {
    return "unknown page";
  }
}

export const cspReportsRoute = new Hono().post("/", async (c) => {
  let reports: Report[] = [];
  try {
    const body = JSON.parse((await c.req.text()).slice(0, 64_000)) as unknown;
    reports = Array.isArray(body) ? body.map((r) => ((r as { body?: Report }).body ?? {}) as Report) : [((body as { "csp-report"?: Report })["csp-report"] ?? {}) as Report];
  } catch {
    return c.body(null, 204);
  }
  for (const r of reports.slice(0, 10)) {
    const directive = String(r.effectiveDirective ?? r["effective-directive"] ?? r["violated-directive"] ?? "unknown directive");
    const blocked = blockedLabel(String(r.blockedURL ?? r["blocked-uri"] ?? ""));
    await recordError({ source: "client", kind: "CSP", message: `${directive} would block ${blocked}`.slice(0, 500), where: pagePath(String(r.documentURL ?? r["document-uri"] ?? "")) });
  }
  return c.body(null, 204);
});

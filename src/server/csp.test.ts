import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { contentSecurityPolicy, cspHeader } from "./csp";

describe("the Content-Security-Policy", () => {
  it("allows this origin's scripts and index.html's inline scripts by hash, and reports", () => {
    const inline = "(function () { document.documentElement.dataset.x = 1; })();";
    const policy = contentSecurityPolicy(`<head><script>${inline}</script><script type="module" src="/assets/a.js"></script></head>`);
    const hash = createHash("sha256").update(inline).digest("base64");
    expect(policy).toContain(`script-src 'self' 'sha256-${hash}'`);
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("frame-ancestors 'self'");
    expect(policy).toMatch(/report-uri \/api\/csp-reports$/);
    expect(policy).not.toContain("unsafe-eval");
  });

  it("is enforced by default, and only reported with CSP=report-only", () => {
    expect(cspHeader("enforce")).toBe("Content-Security-Policy");
    expect(cspHeader("report-only")).toBe("Content-Security-Policy-Report-Only");
  });
});

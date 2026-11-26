// The app-wide Content-Security-Policy, report-only for now: browsers report what it would block to
// /api/csp-reports (grouped in the operator console as CSP errors) without blocking anything. Once a round
// of testers has run without reports, send the same policy as Content-Security-Policy. Attachments keep
// their own enforced sandbox policy (services/attachmentResponse.ts).
import { createHash } from "node:crypto";

export const CSP_REPORT_PATH = "/api/csp-reports";

/** The policy for the built client: scripts from this origin plus index.html's inline scripts, by hash. */
export function contentSecurityPolicy(indexHtml: string): string {
  const inline = [...indexHtml.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${createHash("sha256").update(m[1]!).digest("base64")}'`);
  return [
    "default-src 'self'",
    `script-src 'self' ${inline.join(" ")}`.trim(),
    // React and Base UI position popovers with style attributes.
    "style-src 'self' 'unsafe-inline'",
    // Markdown in descriptions may show images from anywhere; previews use blob: and data: URLs.
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-src 'self'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    `report-uri ${CSP_REPORT_PATH}`,
  ].join("; ");
}

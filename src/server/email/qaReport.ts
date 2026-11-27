// The email a QA note becomes (shared/qa.ts): to todoi's own inbox, not to a customer, so it is not one of
// Design's account emails. It is written to be read later by a person or an agent: what was said first,
// then every fact as a labelled line, then the same facts as JSON. The screenshot rides along as an
// attachment. Pure: no environment, no I/O.
import type { QaContext, QaEnvironment } from "../../shared/qa";
import { shortSha } from "../../shared/build";
import { escapeHtml, type RenderedEmail } from "./templates";

export interface QaReportEmailInput {
  id: string;
  text: string;
  name: string;
  email: string;
  createdAt: Date;
  environment: QaEnvironment;
  /** The deployment's address (APP_URL) */
  appUrl: string;
  /** The API's own build, next to the browser's in `context.build` */
  serverSha: string;
  context: QaContext;
  /** The attached file and where the stored copy is served; null when no screenshot arrived */
  screenshot: { filename: string; url: string; bytes: number } | null;
}

/** "2026-11-27T15-04-05Z": a timestamp that sorts and is safe in a file name. */
export const qaStamp = (at: Date) => at.toISOString().replace(/\.\d+Z$/, "Z").replace(/:/g, "-");
export const qaScreenshotName = (id: string, at: Date) => `qa-${qaStamp(at)}-${id}.png`;

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
const excerpt = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

/** Label and value pairs, in reading order; shared by the text and the HTML part. */
function facts(r: QaReportEmailInput): Array<[string, string]> {
  const c = r.context;
  const appearance = Object.entries(c.appearance).map(([k, v]) => `${k}=${v}`).join(" ");
  const capture = c.capture.ok
    ? `${c.strokes} ${c.strokes === 1 ? "stroke" : "strokes"}${c.capture.method === "screen" ? ", exact capture of the screen" : ""}`
    : `the page could not be drawn (${c.capture.error ?? "unknown reason"}), drawing only`;
  return [
    ["From", `${oneLine(r.name)} <${r.email}>`],
    ["Sent", `${r.createdAt.toISOString()} (browser clock ${c.sentAt}, ${c.timeZone})`],
    ["Environment", `${r.environment} (${r.appUrl})`],
    ["Page", c.url],
    ["Page title", oneLine(c.title)],
    ["Browser", c.userAgent],
    ["Viewport", `${Math.round(c.viewport.width)}x${Math.round(c.viewport.height)} at ${c.viewport.dpr}x (screen ${Math.round(c.screen.width)}x${Math.round(c.screen.height)}), ${c.language}, ${c.online ? "online" : "offline"}`],
    ["Appearance", appearance || "-"],
    ["Build", `browser ${shortSha(c.build.sha)}${c.build.builtAt ? ` (${c.build.builtAt})` : ""}, server ${shortSha(r.serverSha)}`],
    ["Screenshot", r.screenshot ? `${r.screenshot.filename} (attached, ${Math.max(1, Math.round(r.screenshot.bytes / 1024))} kB, ${capture})` : "none"],
    ...(r.screenshot ? ([["Stored copy", r.screenshot.url]] as Array<[string, string]>) : []),
    ["Note id", r.id],
  ];
}

const markedLine = (m: QaContext["marked"][number]) =>
  `${m.selector}${m.label ? ` [${m.label}]` : ""}${m.text ? ` "${m.text}"` : ""} at ${m.rect.map((n) => Math.round(n)).join(",")}`;

export function qaReportEmail(r: QaReportEmailInput): RenderedEmail {
  const said = r.text.trim();
  const rows = facts(r);
  const width = Math.max(...rows.map(([label]) => label.length)) + 1;
  const marked = r.context.marked.map(markedLine);
  const json = JSON.stringify({ id: r.id, createdAt: r.createdAt.toISOString(), environment: r.environment, appUrl: r.appUrl, serverSha: r.serverSha, from: { name: r.name, email: r.email }, text: said, screenshot: r.screenshot, context: r.context }, null, 2);
  const subject = `[QA ${r.environment}] ${excerpt(oneLine(said) || "Drawing without a note", 90)}`;

  const text = [
    said || "(no text: see the drawing in the screenshot)",
    `--\n${rows.map(([label, value]) => `${`${label}:`.padEnd(width + 1)}${value}`).join("\n")}`,
    ...(marked.length ? [`Under the drawing (topmost element at each stroke):\n${marked.map((line, i) => `${i + 1}. ${line}`).join("\n")}`] : []),
    ...(r.context.errors.length ? [`Errors the browser reported on this page load:\n${r.context.errors.map((e) => `- ${e}`).join("\n")}`] : []),
    `JSON:\n${json}`,
  ].join("\n\n");

  const cell = `style="padding:2px 12px 2px 0;font:13px/20px Helvetica,Arial,sans-serif;color:#111111;vertical-align:top;"`;
  const list = (title: string, lines: string[]) =>
    lines.length ? `<p style="margin:16px 0 4px;font:bold 13px/20px Helvetica,Arial,sans-serif;color:#111111;">${title}</p><ol style="margin:0;padding-left:20px;font:13px/20px Helvetica,Arial,sans-serif;color:#111111;">${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ol>` : "";
  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px;background:#ffffff;">
<p style="margin:0 0 16px;font:16px/24px Helvetica,Arial,sans-serif;color:#111111;white-space:pre-wrap;">${escapeHtml(said || "(no text: see the drawing in the screenshot)")}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0">${rows.map(([label, value]) => `<tr><td ${cell}><b>${escapeHtml(label)}</b></td><td ${cell}>${escapeHtml(value)}</td></tr>`).join("")}</table>
${list("Under the drawing (topmost element at each stroke)", marked)}${list("Errors the browser reported on this page load", r.context.errors)}
<p style="margin:16px 0 4px;font:bold 13px/20px Helvetica,Arial,sans-serif;color:#111111;">JSON</p>
<pre style="margin:0;padding:12px;background:#f3f3f1;font:12px/18px Menlo,Consolas,monospace;color:#111111;white-space:pre-wrap;word-break:break-word;">${escapeHtml(json)}</pre>
</body>
</html>
`;
  return { subject, html, text: `${text}\n` };
}

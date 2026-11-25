// Reports what broke in the browser to the server's error tracking (POST /api/errors, work plan R8):
// uncaught errors, unhandled promise rejections and screens that failed to render. Only the error's
// name, message, stack and the page path are sent — never page content. Each problem is reported once
// per page load, and at most 20 in all, so a loop can't flood the server.
const sent = new Set<string>();
const MAX_REPORTS = 20;

export function reportError(error: unknown, context?: string) {
  const e = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Unknown error");
  const message = `${context ? `${context}: ` : ""}${e.message || e.name}`.slice(0, 500);
  const key = `${e.name}\n${message}`;
  if (sent.has(key) || sent.size >= MAX_REPORTS) return;
  sent.add(key);
  void fetch("/api/errors", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: e.name.slice(0, 80), message, stack: e.stack?.slice(0, 4000), path: location.pathname }),
    keepalive: true,
  }).catch(() => undefined);
}

export function installErrorReporting() {
  window.addEventListener("error", (ev) => {
    // Resource load failures (an <img> that 404s) carry no error object; they aren't bugs in the app.
    if (ev.error) reportError(ev.error);
  });
  window.addEventListener("unhandledrejection", (ev) => reportError(ev.reason, "Unhandled rejection"));
}

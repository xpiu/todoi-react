// Where to go after a detour (logging in, a trip to GitHub): only a path inside this app. A browser reads
// "/\evil.example" and "/<tab>/evil.example" as another site, so the address is parsed the way a browser
// parses it and kept only when it stays on the same origin.
const BASE = "http://app.invalid";

export function innerPath(next: string | undefined | null, fallback: string): string {
  if (!next || !next.startsWith("/")) return fallback;
  try {
    const url = new URL(next, BASE);
    return url.origin === BASE ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
}

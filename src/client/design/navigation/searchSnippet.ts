// The Search page's one-line snippet around a match (SearchResults). Pure, so it is unit-tested on its own.

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Where `query` matches in `text`: the whole query, else the earliest query word that starts a word (the server matches word by word). */
export function findMatch(text: string, query: string): { at: number; length: number } | null {
  const low = text.toLowerCase(), q = query.trim().toLowerCase();
  if (!q) return null;
  const whole = low.indexOf(q);
  if (whole >= 0) return { at: whole, length: q.length };
  let best: { at: number; length: number } | null = null;
  for (const w of q.split(/\s+/)) {
    const m = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(w)}`, "u").exec(low);
    const at = m ? m.index + m[1]!.length : -1;
    if (at >= 0 && (!best || at < best.at)) best = { at, length: w.length };
  }
  return best;
}

/**
 * One line around the first match: whitespace collapsed, cut at a word before the match, an ellipsis where text was
 * left out. `hit` is "" when the text has no match; null when there is no text.
 */
export function searchSnippet(text: string | null | undefined, query: string, { lead = 36, max = 140 }: { lead?: number; max?: number } = {}): { pre: string; hit: string; post: string } | null {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!flat) return null;
  const m = findMatch(flat, query);
  if (!m) return { pre: flat.slice(0, max) + (flat.length > max ? "…" : ""), hit: "", post: "" };
  let start = Math.max(0, m.at - lead);
  if (start > 0) {
    const sp = flat.indexOf(" ", start);
    if (sp >= 0 && sp < m.at) start = sp + 1;
  }
  const end = Math.max(Math.min(flat.length, start + max), m.at + m.length);
  return { pre: (start > 0 ? "…" : "") + flat.slice(start, m.at), hit: flat.slice(m.at, m.at + m.length), post: flat.slice(m.at + m.length, end) + (end < flat.length ? "…" : "") };
}

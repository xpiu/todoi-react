// Small text helpers every surface needs: a pluralised count, an "a, b and c" list and a search-match highlighter.
import type { ReactNode } from "react";

import "./text.css";

/** "1 item", "3 items", "2 entries" — the one place the plural rule lives. */
export const count = (n: number, word: string, plural = `${word}s`) => `${n} ${n === 1 ? word : plural}`;

/** "a", "a and b", "a, b and c" — no Oxford comma, as the app's copy is written. */
export const joinAnd = (parts: string[]) => (parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : (parts[0] ?? ""));

/** `text` with the first case-insensitive occurrence of `q` wrapped in <mark>; `q` is already lower-cased and trimmed. */
export function Mark({ text, q }: { text: string; q: string }): ReactNode {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q);
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="td-mark">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

// A rough price list, for the log's running cost estimate only: while a Claude Code call runs, its token
// counts are priced here; once it ends, the cost Claude Code reports (total_cost_usd) replaces the estimate.
// List prices per million tokens on the Claude API, cached 2026-09-25. Cache writes cost 1.25x input for the
// five-minute cache and 2x for the one-hour cache Claude Code uses. Output streams in before its thinking
// tokens are counted, so a running estimate errs low until the call reports.

export interface Tokens {
  input: number;
  output: number;
  cacheRead: number;
  /** All cache writes, the one-hour ones included */
  cacheWrite: number;
  cacheWrite1h: number;
}

type Rate = Omit<Tokens, "cacheWrite1h">;

const RATES: Array<[RegExp, Rate]> = [
  [/fable|mythos/, { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 }],
  [/opus-5-5/, { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 }],
  [/opus/, { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 }],
  [/sonnet-5/, { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 }],
  [/sonnet/, { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 }],
  [/haiku/, { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 }],
];

/** Claude Code's default model, for a model the list doesn't know */
const FALLBACK: Rate = RATES[1]![1];

export const NO_TOKENS: Tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cacheWrite1h: 0 };

export const addTokens = (a: Tokens, b: Tokens, sign = 1): Tokens => ({
  input: a.input + sign * b.input,
  output: a.output + sign * b.output,
  cacheRead: a.cacheRead + sign * b.cacheRead,
  cacheWrite: a.cacheWrite + sign * b.cacheWrite,
  cacheWrite1h: a.cacheWrite1h + sign * b.cacheWrite1h,
});

export const totalTokens = (t: Tokens) => t.input + t.output + t.cacheRead + t.cacheWrite;

/** What these tokens cost at list price, roughly */
export function estimateUsd(t: Tokens, model?: string): number {
  const rate = RATES.find(([re]) => re.test(model ?? ""))?.[1] ?? FALLBACK;
  const short = t.cacheWrite - t.cacheWrite1h;
  return (t.input * rate.input + t.output * rate.output + t.cacheRead * rate.cacheRead + short * rate.cacheWrite + t.cacheWrite1h * rate.input * 2) / 1_000_000;
}

// A rough price list, for the log's running cost estimate only: while a Claude Code call runs, its token
// counts are priced here; once it ends, the cost Claude Code reports (total_cost_usd) replaces the estimate.
// List prices per million tokens on the Claude API, cached 2026-09-25. Cache writes cost 1.25x input for the
// five-minute cache and 2x for the one-hour cache Claude Code uses. Output streams in before its thinking
// tokens are counted, so a running estimate errs low until the call reports.

export interface Tokens {
  input: number;
  output: number;
  cacheRead: number;
  /** Five-minute cache writes (1.25x input) */
  cacheWrite: number;
  /** One-hour cache writes (2x input) */
  cacheWrite1h: number;
}

/** Per million tokens; cache writes follow from input */
type Rate = { input: number; output: number; cacheRead: number };

const RATES: Array<[RegExp, Rate]> = [
  [/fable|mythos/, { input: 10, output: 50, cacheRead: 0.25 }],
  [/opus-5-5/, { input: 4, output: 20, cacheRead: 0.2 }],
  [/opus/, { input: 5, output: 25, cacheRead: 0.5 }],
  [/sonnet-5/, { input: 2, output: 10, cacheRead: 0.2 }],
  [/sonnet/, { input: 3, output: 15, cacheRead: 0.3 }],
  [/haiku/, { input: 1, output: 5, cacheRead: 0.1 }],
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

export const totalTokens = (t: Tokens) => t.input + t.output + t.cacheRead + t.cacheWrite + t.cacheWrite1h;

/** What these tokens cost at list price, roughly */
export function estimateUsd(t: Tokens, model?: string): number {
  const rate = RATES.find(([re]) => re.test(model ?? ""))?.[1] ?? FALLBACK;
  return (t.input * rate.input + t.output * rate.output + t.cacheRead * rate.cacheRead + t.cacheWrite * rate.input * 1.25 + t.cacheWrite1h * rate.input * 2) / 1_000_000;
}

/** A change to a job's token meter. `reportedUsd` is set once, when the call ends with its own cost */
export interface UsageChange {
  tokens: Tokens;
  estimatedUsd: number;
  reportedUsd?: number;
}

/**
 * One call's usage as it streams. Claude Code repeats a message's usage for each of its blocks, so each
 * message keeps its latest counts and a repeat adds only what changed.
 */
export class CallUsage {
  private messages = new Map<string, { tokens: Tokens; usd: number }>();
  private estimated = 0;

  add(messageId: string, tokens: Tokens, model?: string): UsageChange {
    const was = this.messages.get(messageId) ?? { tokens: NO_TOKENS, usd: 0 };
    const usd = estimateUsd(tokens, model);
    this.messages.set(messageId, { tokens, usd });
    this.estimated += usd - was.usd;
    return { tokens: addTokens(tokens, was.tokens, -1), estimatedUsd: usd - was.usd };
  }

  /** The call ended with its own cost, which replaces its estimate */
  report(usd: number): UsageChange {
    const change = { tokens: NO_TOKENS, estimatedUsd: -this.estimated, reportedUsd: usd };
    this.estimated = 0;
    return change;
  }
}

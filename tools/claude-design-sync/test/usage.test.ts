// The token meter's inputs: usage read from Claude Code's stream, and the rough list-price estimate.
import { expect, it } from "vitest";

import { parseClaudeLine } from "../src/engine/harness";
import { addTokens, estimateUsd, NO_TOKENS, totalTokens } from "../src/engine/pricing";

// An assistant line as Claude Code 2.1 streams it (a real Haiku call, trimmed)
const line = JSON.stringify({
  type: "assistant",
  message: {
    id: "msg_011CfrH5HZSaQt7TwCXMZTUN", model: "claude-haiku-4-5-20251001", content: [{ type: "text", text: "hi" }],
    usage: { input_tokens: 10, cache_creation_input_tokens: 8797, cache_read_input_tokens: 13803, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 8797 }, output_tokens: 43 },
  },
});

it("reads a message's usage from Claude Code's stream", () => {
  expect(parseClaudeLine(line)).toContainEqual({
    type: "usage", messageId: "msg_011CfrH5HZSaQt7TwCXMZTUN", model: "claude-haiku-4-5-20251001",
    tokens: { input: 10, output: 43, cacheRead: 13803, cacheWrite: 8797, cacheWrite1h: 8797 },
  });
  // lines without usage say nothing about tokens
  expect(parseClaudeLine(JSON.stringify({ type: "assistant", message: { model: "m", content: [] } })).some((e) => e.type === "usage")).toBe(false);
});

it("prices tokens close to what Claude Code reports", () => {
  const usage = parseClaudeLine(line).find((e) => e.type === "usage")!;
  if (usage.type !== "usage") throw new Error("no usage");
  // Claude Code reported $0.0191993 for this call
  expect(estimateUsd(usage.tokens, usage.model)).toBeCloseTo(0.0191993, 5);
  // an unknown model is priced like Claude Code's default, Opus 5.5
  expect(estimateUsd({ ...NO_TOKENS, output: 1_000_000 }, "fake")).toBe(20);
  expect(estimateUsd({ ...NO_TOKENS, input: 1_000_000, cacheWrite: 1_000_000 }, "claude-sonnet-5-5")).toBe(4.5);
  expect(totalTokens(addTokens(usage.tokens, usage.tokens))).toBe(2 * (10 + 43 + 13803 + 8797));
});

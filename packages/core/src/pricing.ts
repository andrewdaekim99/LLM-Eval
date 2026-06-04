// Pricing table for cost calculation. Values are USD per million tokens.
//
// NOTE: These are placeholder values for the three pinned snapshots used by Yardstick.
// Verify against the official Anthropic pricing page before relying on absolute cost
// numbers in CI thresholds. The *relative* numbers (haiku < sonnet < opus) and the
// *structure* of the table are what we test.

import type { ModelId } from "./types.js";

export interface PricingEntry {
  readonly inputPerMTok: number;
  readonly outputPerMTok: number;
}

const PRICING: Record<ModelId, PricingEntry> = {
  "claude-haiku-4-5": { inputPerMTok: 1, outputPerMTok: 5 },
  "claude-sonnet-4-6": { inputPerMTok: 3, outputPerMTok: 15 },
  "claude-opus-4-8": { inputPerMTok: 15, outputPerMTok: 75 },
};

export interface CostInputs {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly model: ModelId;
}

/** Returns the cost in USD for a single generation. Unknown models return 0 and log. */
export function costOf({ inputTokens, outputTokens, model }: CostInputs): number {
  const entry = PRICING[model];
  if (!entry) return 0;
  const inputCost = (inputTokens / 1_000_000) * entry.inputPerMTok;
  const outputCost = (outputTokens / 1_000_000) * entry.outputPerMTok;
  return roundCents(inputCost + outputCost);
}

/** Returns true if pricing for this model is known. */
export function hasPricing(model: ModelId): boolean {
  return model in PRICING;
}

/** Rounds to 6 decimal places — fractions of a cent matter at evaluation scale. */
function roundCents(usd: number): number {
  return Math.round(usd * 1_000_000) / 1_000_000;
}

export const _testing = { PRICING };

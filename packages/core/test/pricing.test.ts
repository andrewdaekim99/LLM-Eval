import { describe, expect, it } from "vitest";
import { costOf, hasPricing } from "../src/pricing.js";

describe("pricing", () => {
  it("returns 0 for an unknown model", () => {
    expect(costOf({ inputTokens: 1000, outputTokens: 1000, model: "unknown" })).toBe(0);
  });

  it("computes haiku cost correctly", () => {
    // 1M input @ $1 + 1M output @ $5 = $6.00
    const cost = costOf({
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      model: "claude-haiku-4-5",
    });
    expect(cost).toBe(6);
  });

  it("computes sonnet cost correctly", () => {
    // 1M input @ $3 + 1M output @ $15 = $18.00
    const cost = costOf({
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      model: "claude-sonnet-4-6",
    });
    expect(cost).toBe(18);
  });

  it("computes opus cost correctly", () => {
    // 1M input @ $15 + 1M output @ $75 = $90.00
    const cost = costOf({
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      model: "claude-opus-4-8",
    });
    expect(cost).toBe(90);
  });

  it("handles fractional token counts at 6-decimal precision", () => {
    const cost = costOf({ inputTokens: 1, outputTokens: 1, model: "claude-haiku-4-5" });
    // (1/1e6 * 1) + (1/1e6 * 5) = 0.000006
    expect(cost).toBe(0.000006);
  });

  it("ranks models by cost: haiku < sonnet < opus", () => {
    const args = { inputTokens: 1000, outputTokens: 1000 };
    expect(costOf({ ...args, model: "claude-haiku-4-5" })).toBeLessThan(
      costOf({ ...args, model: "claude-sonnet-4-6" }),
    );
    expect(costOf({ ...args, model: "claude-sonnet-4-6" })).toBeLessThan(
      costOf({ ...args, model: "claude-opus-4-8" }),
    );
  });

  it("hasPricing reports true for pinned models and false otherwise", () => {
    expect(hasPricing("claude-haiku-4-5")).toBe(true);
    expect(hasPricing("claude-sonnet-4-6")).toBe(true);
    expect(hasPricing("claude-opus-4-8")).toBe(true);
    expect(hasPricing("gpt-4")).toBe(false);
    expect(hasPricing("claude-haiku-latest")).toBe(false);
  });
});

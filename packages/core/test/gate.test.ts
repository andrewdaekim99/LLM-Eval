import { describe, expect, it } from "vitest";
import { applyGate } from "../src/gate.js";
import type { RunResult, SuiteThresholds } from "../src/types.js";

function makeRun(overrides: Partial<RunResult["summary"]> = {}): RunResult {
  return {
    runId: "00000000-0000-0000-0000-000000000001",
    suite: "fake",
    promptVersion: "v1",
    model: "claude-haiku-4-5",
    startedAt: "2026-06-04T17:00:00.000Z",
    finishedAt: "2026-06-04T17:00:05.000Z",
    cases: [],
    summary: {
      totalCases: 10,
      passedCases: 9,
      passRate: 0.9,
      totalCostUSD: 0.01,
      totalInputTokens: 1000,
      totalOutputTokens: 500,
      latencyMsP50: 300,
      latencyMsP95: 800,
      cacheHitRate: 0,
      ...overrides,
    },
  };
}

describe("applyGate", () => {
  it("passes with no thresholds set", () => {
    const r = applyGate(makeRun(), undefined);
    expect(r.passed).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it("passes when every threshold is met", () => {
    const thresholds: SuiteThresholds = {
      passRate: 0.85,
      maxCostUSD: 0.05,
      maxLatencyMsP95: 1000,
    };
    const r = applyGate(makeRun(), thresholds);
    expect(r.passed).toBe(true);
  });

  it("fails on passRate below threshold and includes axis + observed + threshold", () => {
    const r = applyGate(makeRun({ passRate: 0.6 }), { passRate: 0.85 });
    expect(r.passed).toBe(false);
    expect(r.reasons).toHaveLength(1);
    expect(r.reasons[0]?.axis).toBe("passRate");
    expect(r.reasons[0]?.observed).toBe(0.6);
    expect(r.reasons[0]?.threshold).toBe(0.85);
    expect(r.reasons[0]?.message).toContain("60.0%");
  });

  it("fails on cost above threshold", () => {
    const r = applyGate(makeRun({ totalCostUSD: 0.1 }), { maxCostUSD: 0.05 });
    expect(r.passed).toBe(false);
    expect(r.reasons[0]?.axis).toBe("cost");
    expect(r.reasons[0]?.message).toMatch(/\$/);
  });

  it("fails on latency above threshold", () => {
    const r = applyGate(makeRun({ latencyMsP95: 2000 }), { maxLatencyMsP95: 1000 });
    expect(r.passed).toBe(false);
    expect(r.reasons[0]?.axis).toBe("latency");
    expect(r.reasons[0]?.message).toMatch(/ms/);
  });

  it("reports EVERY violation, not just the first", () => {
    const r = applyGate(makeRun({ passRate: 0.5, totalCostUSD: 1.0, latencyMsP95: 5000 }), {
      passRate: 0.85,
      maxCostUSD: 0.05,
      maxLatencyMsP95: 1000,
    });
    expect(r.passed).toBe(false);
    expect(r.reasons.map((x) => x.axis).sort()).toEqual(["cost", "latency", "passRate"]);
  });

  it("does not gate on axes that are undefined in the thresholds", () => {
    const r = applyGate(makeRun({ totalCostUSD: 100, latencyMsP95: 9999 }), { passRate: 0.5 });
    expect(r.passed).toBe(true);
  });

  it("passes the edge case where observed exactly equals the threshold", () => {
    const r = applyGate(makeRun({ passRate: 0.85, totalCostUSD: 0.05, latencyMsP95: 1000 }), {
      passRate: 0.85,
      maxCostUSD: 0.05,
      maxLatencyMsP95: 1000,
    });
    expect(r.passed).toBe(true);
  });

  it("handles zero-cases runs without crashing", () => {
    const r = applyGate(makeRun({ totalCases: 0, passedCases: 0, passRate: 0 }), {
      passRate: 0.5,
    });
    expect(r.passed).toBe(false);
    expect(r.reasons[0]?.axis).toBe("passRate");
  });
});

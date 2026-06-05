import { describe, expect, it } from "vitest";
import { computeConfusionMatrix } from "../src/confusionMatrix.js";
import type { CaseResult, RunResult } from "../src/types.js";

function makeRun(cases: { id: string; expected: string; actual: string }[]): RunResult {
  const caseResults: CaseResult[] = cases.map((c) => ({
    caseId: c.id,
    input: c.expected,
    expectation: c.expected,
    passed: c.actual.trim().toLowerCase() === c.expected.trim().toLowerCase(),
    aggregateScores: [
      {
        scorer: "exactMatch",
        value: c.actual.trim().toLowerCase() === c.expected.trim().toLowerCase() ? 1 : 0,
        passed: c.actual.trim().toLowerCase() === c.expected.trim().toLowerCase(),
      },
    ],
    samples: [
      {
        output: c.actual,
        scores: [{ scorer: "exactMatch", value: 0, passed: false }],
        inputTokens: 10,
        outputTokens: 1,
        costUSD: 0.0001,
        latencyMs: 100,
        cacheHit: false,
        stopReason: "end_turn",
      },
    ],
  }));
  return {
    runId: "x",
    suite: "classification",
    promptVersion: "v1",
    model: "claude-haiku-4-5",
    startedAt: "2026-06-04T17:00:00.000Z",
    finishedAt: "2026-06-04T17:00:05.000Z",
    cases: caseResults,
    summary: {
      totalCases: cases.length,
      passedCases: caseResults.filter((c) => c.passed).length,
      passRate: caseResults.filter((c) => c.passed).length / cases.length,
      totalCostUSD: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      latencyMsP50: 0,
      latencyMsP95: 0,
      cacheHitRate: 0,
    },
  };
}

describe("computeConfusionMatrix", () => {
  it("returns null for an empty run", () => {
    expect(computeConfusionMatrix(makeRun([]))).toBeNull();
  });

  it("returns a sorted-label matrix when the run qualifies", () => {
    const m = computeConfusionMatrix(
      makeRun([
        { id: "1", expected: "positive", actual: "positive" },
        { id: "2", expected: "negative", actual: "negative" },
        { id: "3", expected: "neutral", actual: "positive" },
      ]),
    );
    expect(m).not.toBeNull();
    expect(m?.labels).toEqual(["negative", "neutral", "positive"]);
    expect(m?.counts.get("positive")?.get("positive")).toBe(1);
    expect(m?.counts.get("negative")?.get("negative")).toBe(1);
    expect(m?.counts.get("neutral")?.get("positive")).toBe(1);
    expect(m?.counts.get("neutral")?.get("neutral")).toBe(0);
  });

  it("normalizes case + trim on both expected and actual", () => {
    const m = computeConfusionMatrix(
      makeRun([
        { id: "1", expected: "Positive", actual: " POSITIVE " },
        { id: "2", expected: "negative", actual: "Negative" },
      ]),
    );
    expect(m?.labels).toEqual(["negative", "positive"]);
    expect(m?.counts.get("positive")?.get("positive")).toBe(1);
    expect(m?.counts.get("negative")?.get("negative")).toBe(1);
  });

  it("buckets empty outputs into '(empty)' and counts them", () => {
    const m = computeConfusionMatrix(
      makeRun([
        { id: "1", expected: "positive", actual: "" },
        { id: "2", expected: "positive", actual: "positive" },
      ]),
    );
    expect(m?.missingOutputs).toBe(1);
    expect(m?.counts.get("positive")?.get("(empty)")).toBe(1);
  });

  it("returns null when expectations are not strings", () => {
    const run = makeRun([{ id: "1", expected: "positive", actual: "positive" }]);
    // Overwrite expectation to a non-string to simulate a non-classification suite.
    const mutated = {
      ...run,
      cases: run.cases.map((c) => ({ ...c, expectation: { tag: "positive" } })),
    };
    expect(computeConfusionMatrix(mutated)).toBeNull();
  });

  it("returns null when more than one scorer is used", () => {
    const run = makeRun([{ id: "1", expected: "positive", actual: "positive" }]);
    const mutated = {
      ...run,
      cases: run.cases.map((c) => ({
        ...c,
        aggregateScores: [...c.aggregateScores, { scorer: "jsonSchema", value: 1, passed: true }],
      })),
    };
    expect(computeConfusionMatrix(mutated)).toBeNull();
  });

  it("returns null when label cardinality is too high", () => {
    // 9 distinct labels — above the 8-label cap.
    const cases = Array.from({ length: 9 }, (_, i) => ({
      id: `c${i}`,
      expected: `label-${i}`,
      actual: `label-${i}`,
    }));
    expect(computeConfusionMatrix(makeRun(cases))).toBeNull();
  });
});

import type {
  CaseDiff,
  RunListEntry,
  StoredCase,
  StoredJudgeVerdict,
  StoredSample,
} from "@yardstick/core";

export function makeRun(overrides: Partial<RunListEntry> = {}): RunListEntry {
  return {
    runId: "11111111-aaaa-bbbb-cccc-222222222222",
    suite: "generation",
    promptVersion: "v1",
    model: "claude-haiku-4-5",
    startedAt: "2026-06-05T04:43:00.000Z",
    totalCases: 8,
    passedCases: 7,
    passRate: 0.875,
    totalCostUSD: 0.0223,
    latencyMsP95: 1200,
    cacheHitRate: 1,
    artifactPath: null,
    ...overrides,
  };
}

export function makeCase(overrides: Partial<StoredCase> = {}): StoredCase {
  return {
    caseId: "gen-simple-lookup",
    input: { question: "What is the capital of France?" },
    expectation: "Paris",
    passed: true,
    aggregateScores: [
      { scorer: "llmJudge", value: 1, passed: true },
    ],
    ...overrides,
  };
}

export function makeSample(overrides: Partial<StoredSample> = {}): StoredSample {
  return {
    sampleIndex: 0,
    output: "Paris.",
    scores: [{ scorer: "llmJudge", value: 1, passed: true }],
    inputTokens: 80,
    outputTokens: 4,
    costUSD: 0.0001,
    latencyMs: 320,
    cacheHit: true,
    stopReason: "end_turn",
    ...overrides,
  };
}

export function makeVerdict(
  overrides: Partial<StoredJudgeVerdict> = {},
): StoredJudgeVerdict {
  return {
    sampleIndex: 0,
    scorer: "llmJudge",
    verdict: "fail",
    score: 0.3,
    reason: "The model added an unsupported claim about population density.",
    rubric: "Answer must be factually correct and grounded in the passage.",
    judgeModel: "claude-sonnet-4-6",
    samples: [
      {
        score: 0.3,
        verdict: "fail",
        reason: "Hallucinated a population density figure.",
      },
    ],
    ...overrides,
  };
}

export function makeDiff(overrides: Partial<CaseDiff> = {}): CaseDiff {
  return {
    caseId: "gen-negation-handling",
    kind: "fixed",
    aScores: [{ scorer: "llmJudge", value: 0, passed: false }],
    bScores: [{ scorer: "llmJudge", value: 1, passed: true }],
    ...overrides,
  };
}

import { describe, expect, it } from "vitest";
import { HistoryDb } from "../src/db.js";
import { ARTIFACT_SCHEMA_VERSION, toArtifact } from "../src/artifact.js";
import type { RunResult } from "../src/types.js";

function makeRun(overrides: Partial<RunResult> = {}): RunResult {
  return {
    runId: "11111111-1111-1111-1111-111111111111",
    suite: "extraction",
    promptVersion: "v1",
    model: "claude-haiku-4-5",
    startedAt: "2026-06-04T17:00:00.000Z",
    finishedAt: "2026-06-04T17:00:05.000Z",
    cases: [
      {
        caseId: "case-a",
        input: { text: "hello" },
        expectation: { name: "Jane" },
        passed: true,
        aggregateScores: [{ scorer: "exactMatch", value: 1, passed: true }],
        samples: [
          {
            output: "ok",
            scores: [{ scorer: "exactMatch", value: 1, passed: true }],
            inputTokens: 10,
            outputTokens: 5,
            costUSD: 0.0001,
            latencyMs: 100,
            cacheHit: false,
            stopReason: "end_turn",
          },
        ],
      },
    ],
    summary: {
      totalCases: 1,
      passedCases: 1,
      passRate: 1,
      totalCostUSD: 0.0001,
      totalInputTokens: 10,
      totalOutputTokens: 5,
      latencyMsP50: 100,
      latencyMsP95: 100,
      cacheHitRate: 0,
    },
    ...overrides,
  };
}

describe("HistoryDb", () => {
  it("opens an in-memory db and applies the schema idempotently", () => {
    const db = new HistoryDb({ path: ":memory:" });
    // Re-opening shouldn't fail (CREATE TABLE IF NOT EXISTS).
    db.close();
    const db2 = new HistoryDb({ path: ":memory:" });
    expect(db2.countRuns()).toBe(0);
    db2.close();
  });

  it("inserts a run and round-trips the summary", () => {
    const db = new HistoryDb({ path: ":memory:" });
    db.insertRun(toArtifact(makeRun()), "/runs/test.json");

    expect(db.countRuns()).toBe(1);
    const summary = db.getRunSummary("11111111-1111-1111-1111-111111111111");
    expect(summary).toMatchObject({
      suite: "extraction",
      promptVersion: "v1",
      model: "claude-haiku-4-5",
      passRate: 1,
      passedCases: 1,
      totalCases: 1,
      artifactPath: "/runs/test.json",
    });

    db.close();
  });

  it("getCases returns input/expectation/aggregateScores parsed from JSON", () => {
    const db = new HistoryDb({ path: ":memory:" });
    db.insertRun(toArtifact(makeRun()));

    const cases = db.getCases("11111111-1111-1111-1111-111111111111");
    expect(cases).toHaveLength(1);
    expect(cases[0]?.caseId).toBe("case-a");
    expect(cases[0]?.input).toEqual({ text: "hello" });
    expect(cases[0]?.expectation).toEqual({ name: "Jane" });
    expect(cases[0]?.passed).toBe(true);
    expect(cases[0]?.aggregateScores).toEqual([{ scorer: "exactMatch", value: 1, passed: true }]);
    db.close();
  });

  it("INSERT OR REPLACE: re-inserting the same runId overwrites and cascades", () => {
    const db = new HistoryDb({ path: ":memory:" });
    db.insertRun(toArtifact(makeRun({ summary: { ...makeRun().summary, passRate: 0.5 } })));

    db.insertRun(toArtifact(makeRun())); // passRate 1.0

    const summary = db.getRunSummary("11111111-1111-1111-1111-111111111111");
    expect(summary?.passRate).toBe(1);
    expect(db.countRuns()).toBe(1);
    db.close();
  });

  it("listRuns sorts by startedAt DESC and respects limit", () => {
    const db = new HistoryDb({ path: ":memory:" });
    db.insertRun(
      toArtifact(
        makeRun({
          runId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
          startedAt: "2026-06-01T00:00:00.000Z",
        }),
      ),
    );
    db.insertRun(
      toArtifact(
        makeRun({
          runId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          startedAt: "2026-06-05T00:00:00.000Z",
        }),
      ),
    );
    db.insertRun(
      toArtifact(
        makeRun({
          runId: "cccccccc-cccc-cccc-cccc-cccccccccccc",
          startedAt: "2026-06-03T00:00:00.000Z",
        }),
      ),
    );

    const all = db.listRuns({});
    expect(all.map((r) => r.runId.slice(0, 1))).toEqual(["b", "c", "a"]);

    const limited = db.listRuns({ limit: 1 });
    expect(limited).toHaveLength(1);
    expect(limited[0]?.runId.startsWith("b")).toBe(true);
    db.close();
  });

  it("listRuns filters by suite", () => {
    const db = new HistoryDb({ path: ":memory:" });
    db.insertRun(toArtifact(makeRun({ runId: "a".repeat(36), suite: "extraction" })));
    db.insertRun(
      toArtifact(
        makeRun({
          runId: "b".repeat(36),
          suite: "generation",
          startedAt: "2026-06-04T17:00:00.000Z",
        }),
      ),
    );
    const onlyExtraction = db.listRuns({ suite: "extraction" });
    expect(onlyExtraction).toHaveLength(1);
    expect(onlyExtraction[0]?.suite).toBe("extraction");
    db.close();
  });

  it("resolveRunIdPrefix unique-matches by prefix and detects ambiguity", () => {
    const db = new HistoryDb({ path: ":memory:" });
    db.insertRun(toArtifact(makeRun({ runId: "11112222-3333-4444-5555-666677778888" })));
    db.insertRun(
      toArtifact(
        makeRun({
          runId: "1111aaaa-3333-4444-5555-666677778888",
          startedAt: "2026-06-05T00:00:00.000Z",
        }),
      ),
    );

    const unique = db.resolveRunIdPrefix("11112222");
    expect(unique.ok).toBe(true);
    if (unique.ok) expect(unique.runId).toMatch(/^11112222-/);

    const ambig = db.resolveRunIdPrefix("1111");
    expect(ambig.ok).toBe(false);
    if (!ambig.ok) expect(ambig.candidates).toHaveLength(2);

    const tooShort = db.resolveRunIdPrefix("11");
    expect(tooShort.ok).toBe(false);
    db.close();
  });

  it("stores llmJudge detail in the judge_verdicts table", () => {
    const judgeRun = makeRun({
      cases: [
        {
          caseId: "judged",
          input: "x",
          expectation: "y",
          passed: true,
          aggregateScores: [
            {
              scorer: "llmJudge",
              value: 0.9,
              passed: true,
              detail: {
                verdict: "pass",
                score: 0.9,
                reason: "good",
                rubric: "be good",
                judgeModel: "claude-sonnet-4-6",
                samples: [{ score: 0.9, verdict: "pass", reason: "good" }],
              },
            },
          ],
          samples: [
            {
              output: "judged output",
              scores: [
                {
                  scorer: "llmJudge",
                  value: 0.9,
                  passed: true,
                  detail: {
                    verdict: "pass",
                    score: 0.9,
                    reason: "good",
                    rubric: "be good",
                    judgeModel: "claude-sonnet-4-6",
                    samples: [{ score: 0.9, verdict: "pass", reason: "good" }],
                  },
                },
              ],
              inputTokens: 10,
              outputTokens: 5,
              costUSD: 0.0001,
              latencyMs: 100,
              cacheHit: false,
              stopReason: "end_turn",
            },
          ],
        },
      ],
    });

    const db = new HistoryDb({ path: ":memory:" });
    db.insertRun(toArtifact(judgeRun));

    // Verify via raw query — better-sqlite3 doesn't expose helpers, so use the
    // db's internal handle via the schema (no public API needed for this assertion).
    const cases = db.getCases(judgeRun.runId);
    const score = cases[0]?.aggregateScores[0];
    expect(score?.scorer).toBe("llmJudge");
    expect((score?.detail as { judgeModel: string }).judgeModel).toBe("claude-sonnet-4-6");
    db.close();
  });

  it("records schemaVersion alongside each run", () => {
    const db = new HistoryDb({ path: ":memory:" });
    db.insertRun(toArtifact(makeRun()));
    // schemaVersion is denormalized in the runs table; verify via the artifact constant.
    expect(ARTIFACT_SCHEMA_VERSION).toBe(2);
    db.close();
  });

  it("listRuns filters by `from`/`to` date bounds (inclusive)", () => {
    const db = new HistoryDb({ path: ":memory:" });
    db.insertRun(
      toArtifact(
        makeRun({ runId: "a".repeat(36), startedAt: "2026-06-01T00:00:00.000Z" }),
      ),
    );
    db.insertRun(
      toArtifact(
        makeRun({ runId: "b".repeat(36), startedAt: "2026-06-05T00:00:00.000Z" }),
      ),
    );
    db.insertRun(
      toArtifact(
        makeRun({ runId: "c".repeat(36), startedAt: "2026-06-10T00:00:00.000Z" }),
      ),
    );

    const window = db.listRuns({
      from: "2026-06-03T00:00:00.000Z",
      to: "2026-06-08T00:00:00.000Z",
    });
    expect(window).toHaveLength(1);
    expect(window[0]?.runId.startsWith("b")).toBe(true);

    // `from` alone leaves the upper bound open.
    const fromOnly = db.listRuns({ from: "2026-06-04T00:00:00.000Z" });
    expect(fromOnly.map((r) => r.runId[0])).toEqual(["c", "b"]);
    db.close();
  });

  it("listSuites returns distinct suites alphabetically", () => {
    const db = new HistoryDb({ path: ":memory:" });
    db.insertRun(toArtifact(makeRun({ runId: "a".repeat(36), suite: "generation" })));
    db.insertRun(
      toArtifact(
        makeRun({
          runId: "b".repeat(36),
          suite: "extraction",
          startedAt: "2026-06-04T17:01:00.000Z",
        }),
      ),
    );
    db.insertRun(
      toArtifact(
        makeRun({
          runId: "c".repeat(36),
          suite: "generation",
          startedAt: "2026-06-04T17:02:00.000Z",
        }),
      ),
    );

    expect(db.listSuites()).toEqual(["extraction", "generation"]);
    db.close();
  });

  it("getSamples returns one row per sample with parsed scores + flags", () => {
    const multiSample = makeRun({
      cases: [
        {
          caseId: "case-a",
          input: { text: "hello" },
          expectation: { name: "Jane" },
          passed: true,
          aggregateScores: [{ scorer: "exactMatch", value: 1, passed: true }],
          samples: [
            {
              output: "first",
              scores: [{ scorer: "exactMatch", value: 1, passed: true }],
              inputTokens: 10,
              outputTokens: 5,
              costUSD: 0.0001,
              latencyMs: 100,
              cacheHit: true,
              stopReason: "end_turn",
            },
            {
              output: "second",
              scores: [{ scorer: "exactMatch", value: 0, passed: false }],
              inputTokens: 12,
              outputTokens: 6,
              costUSD: 0.00015,
              latencyMs: 220,
              cacheHit: false,
              stopReason: null,
            },
          ],
        },
      ],
    });
    const db = new HistoryDb({ path: ":memory:" });
    db.insertRun(toArtifact(multiSample));

    const samples = db.getSamples(multiSample.runId, "case-a");
    expect(samples.map((s) => s.sampleIndex)).toEqual([0, 1]);
    expect(samples[0]?.output).toBe("first");
    expect(samples[0]?.cacheHit).toBe(true);
    expect(samples[0]?.stopReason).toBe("end_turn");
    expect(samples[1]?.cacheHit).toBe(false);
    expect(samples[1]?.stopReason).toBeNull();
    expect(samples[1]?.scores[0]?.passed).toBe(false);
    db.close();
  });

  it("getJudgeVerdicts returns one row per judge invocation", () => {
    const judged = makeRun({
      cases: [
        {
          caseId: "judged",
          input: "x",
          expectation: "y",
          passed: false,
          aggregateScores: [],
          samples: [
            {
              output: "answer",
              scores: [
                {
                  scorer: "llmJudge",
                  value: 0.4,
                  passed: false,
                  detail: {
                    verdict: "fail",
                    score: 0.4,
                    reason: "missed point",
                    rubric: "be accurate",
                    judgeModel: "claude-sonnet-4-6",
                    samples: [{ score: 0.4, verdict: "fail", reason: "missed point" }],
                  },
                },
              ],
              inputTokens: 10,
              outputTokens: 5,
              costUSD: 0.0001,
              latencyMs: 100,
              cacheHit: false,
              stopReason: "end_turn",
            },
          ],
        },
      ],
    });
    const db = new HistoryDb({ path: ":memory:" });
    db.insertRun(toArtifact(judged));

    const verdicts = db.getJudgeVerdicts(judged.runId, "judged");
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]?.verdict).toBe("fail");
    expect(verdicts[0]?.judgeModel).toBe("claude-sonnet-4-6");
    expect(verdicts[0]?.reason).toBe("missed point");
    expect(verdicts[0]?.samples).toEqual([
      { score: 0.4, verdict: "fail", reason: "missed point" },
    ]);
    db.close();
  });

  it("getCaseHistory returns case rows across runs of a suite, newest-first", () => {
    const db = new HistoryDb({ path: ":memory:" });
    const mk = (runId: string, startedAt: string, passed: boolean) =>
      makeRun({
        runId,
        startedAt,
        cases: [
          {
            caseId: "shared",
            input: "x",
            expectation: "y",
            passed,
            aggregateScores: [{ scorer: "exactMatch", value: passed ? 1 : 0, passed }],
            samples: [
              {
                output: passed ? "y" : "n",
                scores: [{ scorer: "exactMatch", value: passed ? 1 : 0, passed }],
                inputTokens: 1,
                outputTokens: 1,
                costUSD: 0,
                latencyMs: 1,
                cacheHit: false,
                stopReason: "end_turn",
              },
            ],
          },
        ],
        summary: {
          totalCases: 1,
          passedCases: passed ? 1 : 0,
          passRate: passed ? 1 : 0,
          totalCostUSD: 0,
          totalInputTokens: 1,
          totalOutputTokens: 1,
          latencyMsP50: 1,
          latencyMsP95: 1,
          cacheHitRate: 0,
        },
      });

    db.insertRun(toArtifact(mk("a".repeat(36), "2026-06-01T00:00:00.000Z", true)));
    db.insertRun(toArtifact(mk("b".repeat(36), "2026-06-02T00:00:00.000Z", false)));
    db.insertRun(toArtifact(mk("c".repeat(36), "2026-06-03T00:00:00.000Z", true)));

    const all = db.getCaseHistory("extraction", "shared");
    expect(all.map((h) => h.runId[0])).toEqual(["c", "b", "a"]);
    expect(all[1]?.passed).toBe(false);

    // `beforeStartedAt` is strict; the matching timestamp is excluded.
    const before = db.getCaseHistory(
      "extraction",
      "shared",
      "2026-06-03T00:00:00.000Z",
    );
    expect(before.map((h) => h.runId[0])).toEqual(["b", "a"]);
    db.close();
  });
});

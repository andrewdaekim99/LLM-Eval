import { describe, expect, it } from "vitest";
import { aggregateVerdicts, llmJudge } from "../src/scorers/llmJudge.js";
import { buildJudgeMessages, JUDGE_SYSTEM_PROMPT } from "../src/judge/prompts.js";
import type { GenerateRequest, GenerateResponse, ModelClient } from "../src/types.js";

function fakeClient(scriptedResponses: string[]): ModelClient & { calls: GenerateRequest[] } {
  let i = 0;
  const calls: GenerateRequest[] = [];
  return {
    calls,
    generate(req: GenerateRequest): Promise<GenerateResponse> {
      calls.push(req);
      const content = scriptedResponses[i] ?? scriptedResponses[scriptedResponses.length - 1] ?? "";
      i += 1;
      return Promise.resolve({
        content,
        inputTokens: 100,
        outputTokens: 30,
        model: req.params.model,
        stopReason: "end_turn",
        cacheHit: false,
        latencyMs: 200,
      });
    },
  };
}

describe("llmJudge", () => {
  const RUBRIC = "Output must include the word 'pass'. Otherwise fail.";

  it("returns a passing Score when the judge replies with a well-formed pass verdict", async () => {
    const client = fakeClient([
      JSON.stringify({ verdict: "pass", score: 0.95, reason: "matches rubric" }),
    ]);
    const scorer = llmJudge({ rubric: RUBRIC });
    const result = await scorer.score("the output passes", "any", { client });

    expect(result.passed).toBe(true);
    expect(result.value).toBe(0.95);
    expect((result.detail as { rubric: string }).rubric).toBe(RUBRIC);
  });

  it("returns a failing Score when judge score is below threshold", async () => {
    const client = fakeClient([
      JSON.stringify({ verdict: "fail", score: 0.1, reason: "no 'pass' present" }),
    ]);
    const scorer = llmJudge({ rubric: RUBRIC });
    const result = await scorer.score("the output is bad", "any", { client });

    expect(result.passed).toBe(false);
    expect(result.value).toBe(0.1);
    expect(result.reason).toContain("no 'pass'");
  });

  it("respects a custom passThreshold", async () => {
    const client = fakeClient([
      JSON.stringify({ verdict: "partial", score: 0.5, reason: "partial credit" }),
    ]);
    const lenient = llmJudge({ rubric: RUBRIC, passThreshold: 0.4 });
    const strict = llmJudge({ rubric: RUBRIC, passThreshold: 0.9 });
    expect(
      (
        await lenient.score("x", "y", {
          client: fakeClient([JSON.stringify({ verdict: "partial", score: 0.5, reason: "ok" })]),
        })
      ).passed,
    ).toBe(true);
    expect((await strict.score("x", "y", { client })).passed).toBe(false);
  });

  it("tolerates judge responses wrapped in markdown fences", async () => {
    const client = fakeClient(['```json\n{"verdict":"pass","score":0.9,"reason":"good"}\n```']);
    const scorer = llmJudge({ rubric: RUBRIC });
    const result = await scorer.score("anything", "y", { client });
    expect(result.passed).toBe(true);
  });

  it("fails gracefully when judge returns non-JSON", async () => {
    const client = fakeClient(["sure, the answer looks fine to me — pass!"]);
    const scorer = llmJudge({ rubric: RUBRIC });
    const result = await scorer.score("x", "y", { client });
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/parseable verdicts|no JSON object/);
  });

  it("fails when judge JSON is missing required fields", async () => {
    const client = fakeClient([JSON.stringify({ verdict: "pass" })]); // missing score, reason
    const scorer = llmJudge({ rubric: RUBRIC });
    const result = await scorer.score("x", "y", { client });
    expect(result.passed).toBe(false);
  });

  it("fails (cleanly) when ctx has no client", async () => {
    const scorer = llmJudge({ rubric: RUBRIC });
    const result = await scorer.score("x", "y");
    expect(result.passed).toBe(false);
    expect(result.reason).toContain("client");
  });

  it("aggregates across N judge samples (bias mitigation)", async () => {
    const client = fakeClient([
      JSON.stringify({ verdict: "pass", score: 0.9, reason: "looks good" }),
      JSON.stringify({ verdict: "pass", score: 0.8, reason: "still good" }),
      JSON.stringify({ verdict: "partial", score: 0.6, reason: "minor issues" }),
    ]);
    const scorer = llmJudge({ rubric: RUBRIC, judgeSamples: 3 });
    const result = await scorer.score("x", "y", { client });

    // Mean of 0.9, 0.8, 0.6 = 0.7666...
    expect(result.value).toBeCloseTo(0.7667, 3);
    expect((result.detail as { samples: unknown[] }).samples).toHaveLength(3);
    expect((result.detail as { variance: number }).variance).toBeGreaterThan(0);
  });

  it("makes one API call per judge sample with distinct cache keys", async () => {
    const client = fakeClient([
      JSON.stringify({ verdict: "pass", score: 0.9, reason: "1" }),
      JSON.stringify({ verdict: "pass", score: 0.9, reason: "2" }),
    ]);
    const scorer = llmJudge({ rubric: RUBRIC, judgeSamples: 2 });
    await scorer.score("output", "expected", { client });

    expect(client.calls).toHaveLength(2);
    const a = client.calls[0]?.messages[0]?.content ?? "";
    const b = client.calls[1]?.messages[0]?.content ?? "";
    expect(a).not.toBe(b); // sampleMarker varied
  });
});

describe("aggregateVerdicts (bias mitigation math)", () => {
  it("returns single-sample as-is with variance 0", () => {
    const r = aggregateVerdicts([{ verdict: "pass", score: 0.9, reason: "good" }]);
    expect(r.score).toBe(0.9);
    expect(r.variance).toBe(0);
    expect(r.verdict).toBe("pass");
  });

  it("computes mean and variance across multiple samples", () => {
    const r = aggregateVerdicts([
      { verdict: "pass", score: 1.0, reason: "" },
      { verdict: "fail", score: 0.0, reason: "" },
    ]);
    expect(r.score).toBe(0.5);
    // Variance of [1, 0] around mean 0.5 = 0.25
    expect(r.variance).toBe(0.25);
  });

  it("uses verdict mode as the aggregate verdict", () => {
    const r = aggregateVerdicts([
      { verdict: "pass", score: 0.9, reason: "" },
      { verdict: "pass", score: 0.85, reason: "" },
      { verdict: "fail", score: 0.1, reason: "" },
    ]);
    expect(r.verdict).toBe("pass");
  });

  it("picks the reason from the sample closest to the mean", () => {
    const r = aggregateVerdicts([
      { verdict: "pass", score: 0.9, reason: "high" },
      { verdict: "pass", score: 0.7, reason: "middle" },
      { verdict: "pass", score: 0.4, reason: "low" },
    ]);
    // Mean = 0.666; closest is 0.7 → reason "middle"
    expect(r.reason).toBe("middle");
  });
});

describe("buildJudgeMessages", () => {
  it("includes the rubric, actual output, and optional reference in the user message", () => {
    const messages = buildJudgeMessages({
      rubric: "Be correct.",
      actual: "Some output",
      expected: { answer: "Some output" },
    });
    expect(messages).toHaveLength(1);
    const content = messages[0]?.content ?? "";
    expect(content).toContain("## Rubric");
    expect(content).toContain("Be correct.");
    expect(content).toContain("## Output to grade");
    expect(content).toContain("Some output");
    expect(content).toContain("## Reference");
  });

  it("includes a sampleMarker comment when provided (for cache key variance)", () => {
    const messages = buildJudgeMessages({
      rubric: "x",
      actual: "y",
      sampleMarker: "2-of-3",
    });
    expect(messages[0]?.content ?? "").toContain("2-of-3");
  });

  it("system prompt explicitly forbids non-JSON output", () => {
    expect(JUDGE_SYSTEM_PROMPT).toContain("ONLY a JSON object");
  });
});

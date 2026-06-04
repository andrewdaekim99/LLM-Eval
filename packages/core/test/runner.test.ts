import { describe, expect, it } from "vitest";
import { runSuite } from "../src/runner.js";
import { exactMatch } from "../src/scorers/exactMatch.js";
import type { GenerateRequest, GenerateResponse, ModelClient, Suite } from "../src/types.js";

interface FakeBehavior {
  readonly outputByInput: Record<string, string>;
  readonly failOnInput?: string;
}

class FakeClient implements ModelClient {
  public calls: GenerateRequest[] = [];

  constructor(private readonly behavior: FakeBehavior) {}

  generate(req: GenerateRequest): Promise<GenerateResponse> {
    this.calls.push(req);
    const userMsg = req.messages.find((m) => m.role === "user")?.content ?? "";
    if (this.behavior.failOnInput && userMsg.includes(this.behavior.failOnInput)) {
      return Promise.reject(new Error("simulated transport failure"));
    }
    const content = this.behavior.outputByInput[userMsg] ?? "DEFAULT";
    return Promise.resolve({
      content,
      inputTokens: 10,
      outputTokens: 5,
      model: req.params.model,
      stopReason: "end_turn",
      cacheHit: false,
      latencyMs: 42,
    });
  }
}

function makeSuite(cases: [string, string, string][]): Suite<string, string> {
  return {
    name: "fake",
    promptVersion: "v1",
    params: { model: "claude-haiku-4-5", maxTokens: 256, temperature: 0 },
    buildPrompt: (input) => [{ role: "user", content: input }],
    cases: cases.map(([id, input, expectation]) => ({ id, input, expectation })),
    scorers: [exactMatch()],
  };
}

describe("runSuite", () => {
  it("iterates every case and produces a CaseResult per case", async () => {
    const suite = makeSuite([
      ["a", "ping-a", "ping-a"],
      ["b", "ping-b", "ping-b"],
      ["c", "ping-c", "ping-c"],
    ]);
    const client = new FakeClient({
      outputByInput: { "ping-a": "ping-a", "ping-b": "ping-b", "ping-c": "ping-c" },
    });

    const result = await runSuite(suite, { client });

    expect(result.cases).toHaveLength(3);
    expect(result.cases.map((c) => c.caseId)).toEqual(["a", "b", "c"]);
    expect(client.calls).toHaveLength(3);
  });

  it("computes a passing summary when every scorer passes", async () => {
    const suite = makeSuite([
      ["a", "in", "out"],
      ["b", "in2", "out2"],
    ]);
    const client = new FakeClient({ outputByInput: { in: "out", in2: "out2" } });

    const result = await runSuite(suite, { client });

    expect(result.summary.totalCases).toBe(2);
    expect(result.summary.passedCases).toBe(2);
    expect(result.summary.passRate).toBe(1);
    expect(result.cases.every((c) => c.passed)).toBe(true);
  });

  it("computes a partial pass rate when some cases fail", async () => {
    const suite = makeSuite([
      ["pass-1", "p1", "p1"],
      ["fail-1", "f1", "expected"],
      ["pass-2", "p2", "p2"],
      ["fail-2", "f2", "expected"],
    ]);
    const client = new FakeClient({
      outputByInput: { p1: "p1", f1: "wrong", p2: "p2", f2: "wrong" },
    });

    const result = await runSuite(suite, { client });

    expect(result.summary.totalCases).toBe(4);
    expect(result.summary.passedCases).toBe(2);
    expect(result.summary.passRate).toBe(0.5);
  });

  it("does not crash when a sample generation throws — case fails cleanly", async () => {
    const suite = makeSuite([
      ["good", "ok-input", "ok-input"],
      ["bad", "boom", "anything"],
      ["also-good", "ok2", "ok2"],
    ]);
    const client = new FakeClient({
      outputByInput: { "ok-input": "ok-input", ok2: "ok2" },
      failOnInput: "boom",
    });

    const result = await runSuite(suite, { client });

    expect(result.cases).toHaveLength(3);
    expect(result.cases[0]?.passed).toBe(true);
    expect(result.cases[1]?.passed).toBe(false);
    expect(result.cases[1]?.samples[0]?.scores[0]?.reason).toContain("generation failed");
    expect(result.cases[2]?.passed).toBe(true);
    expect(result.summary.passedCases).toBe(2);
  });

  it("does not crash when a scorer throws — that score is recorded as failed", async () => {
    const throwingScorer = {
      name: "throwing",
      score(): never {
        throw new Error("scorer kaboom");
      },
    };
    const suite: Suite<string, string> = {
      ...makeSuite([["a", "in", "expected"]]),
      scorers: [throwingScorer],
    };
    const client = new FakeClient({ outputByInput: { in: "anything" } });

    const result = await runSuite(suite, { client });
    expect(result.cases[0]?.passed).toBe(false);
    expect(result.cases[0]?.samples[0]?.scores[0]?.reason).toContain("scorer threw");
  });

  it("captures cost, tokens, and latency on each sample", async () => {
    const suite = makeSuite([["a", "in", "in"]]);
    const client = new FakeClient({ outputByInput: { in: "in" } });

    const result = await runSuite(suite, { client });
    const sample = result.cases[0]?.samples[0];
    expect(sample?.inputTokens).toBe(10);
    expect(sample?.outputTokens).toBe(5);
    expect(sample?.latencyMs).toBe(42);
    expect(sample?.costUSD).toBeGreaterThan(0);
  });

  it("runs N samples per case when samplesOverride is set", async () => {
    const suite = makeSuite([["a", "in", "in"]]);
    const client = new FakeClient({ outputByInput: { in: "in" } });

    const result = await runSuite(suite, { client, samplesOverride: 3 });
    expect(result.cases[0]?.samples).toHaveLength(3);
    expect(client.calls).toHaveLength(3);
  });

  it("attaches the suite name, prompt version, and model to the result", async () => {
    const suite = makeSuite([["a", "in", "in"]]);
    const client = new FakeClient({ outputByInput: { in: "in" } });

    const result = await runSuite(suite, { client });
    expect(result.suite).toBe("fake");
    expect(result.promptVersion).toBe("v1");
    expect(result.model).toBe("claude-haiku-4-5");
    expect(result.runId).toMatch(/^[0-9a-f-]{36}$/);
  });
});

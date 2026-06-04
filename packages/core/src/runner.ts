// The runner: walks every case in a suite, generates a sample (or N), runs every scorer,
// and assembles an immutable `RunResult`. Side effects (network, fs) live at the edges —
// the runner takes a `ModelClient`; the CLI handles artifact writing.

import { randomUUID } from "node:crypto";
import { childLogger, type Logger } from "./logger.js";
import { costOf, hasPricing } from "./pricing.js";
import type {
  Case,
  CaseResult,
  CaseSample,
  GenerateRequest,
  ModelClient,
  RunResult,
  RunSummary,
  Score,
  Scorer,
  ScorerContext,
  SideCostEntry,
  Suite,
} from "./types.js";

export interface RunOptions {
  readonly client: ModelClient;
  /** Optional per-run override of each case's sample count. Default: case's value or 1. */
  readonly samplesOverride?: number;
}

export async function runSuite<I, E>(suite: Suite<I, E>, opts: RunOptions): Promise<RunResult> {
  const log = childLogger({ component: "runner", suite: suite.name });
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  log.info({ runId, model: suite.params.model, cases: suite.cases.length }, "run start");

  const cases: CaseResult[] = [];
  for (const c of suite.cases) {
    cases.push(await runCase(suite, c, opts, log));
  }

  const finishedAt = new Date().toISOString();
  const summary = summarize(cases);
  log.info({ runId, passRate: summary.passRate, costUSD: summary.totalCostUSD }, "run complete");

  return {
    runId,
    suite: suite.name,
    promptVersion: suite.promptVersion,
    model: suite.params.model,
    startedAt,
    finishedAt,
    cases,
    summary,
  };
}

async function runCase<I, E>(
  suite: Suite<I, E>,
  c: Case<I, E>,
  opts: RunOptions,
  parentLog: Logger,
): Promise<CaseResult> {
  const log = parentLog.child({ caseId: c.id });
  const sampleCount = Math.max(1, opts.samplesOverride ?? c.samples ?? 1);

  const samples: CaseSample[] = [];
  for (let i = 0; i < sampleCount; i++) {
    samples.push(await runSample(suite, c, opts.client, log, i));
  }

  const aggregateScores = aggregateAcrossSamples(samples, suite.scorers);
  const passed = aggregateScores.length > 0 && aggregateScores.every((s) => s.passed);

  return {
    caseId: c.id,
    input: c.input,
    expectation: c.expectation,
    samples,
    aggregateScores,
    passed,
  };
}

async function runSample<I, E>(
  suite: Suite<I, E>,
  c: Case<I, E>,
  client: ModelClient,
  log: Logger,
  sampleIndex: number,
): Promise<CaseSample> {
  const messages = suite.buildPrompt(c.input);
  const params = { ...suite.params, ...c.params };
  const req: GenerateRequest = { params, messages };

  let res;
  try {
    res = await client.generate(req);
  } catch (err) {
    // Sample-level failure: don't crash the whole run; surface the failure on every scorer.
    log.error({ err, sampleIndex }, "sample generation failed");
    return failedSample(suite.scorers, err);
  }

  const sideCosts: SideCostEntry[] = [];
  const ctx: ScorerContext = {
    client,
    logger: log.child({ sampleIndex }),
    recordSideCost: (entry) => sideCosts.push(entry),
  };
  const scores = await Promise.all(
    suite.scorers.map((scorer) => safeScore(scorer, res.content, c.expectation, ctx)),
  );

  // Price against the requested (pinned) model. Anthropic's response model field carries
  // the snapshot date (e.g. `claude-haiku-4-5-20251001`) which won't match the pricing
  // table; the suite's pinned ID is the canonical key.
  if (!hasPricing(params.model)) {
    log.warn({ model: params.model }, "no pricing entry for model — cost will be 0");
  }

  const sutCost = costOf({
    inputTokens: res.inputTokens,
    outputTokens: res.outputTokens,
    model: params.model,
  });
  const sideCostUSD = sideCosts.reduce(
    (acc, e) =>
      acc + costOf({ inputTokens: e.inputTokens, outputTokens: e.outputTokens, model: e.model }),
    0,
  );

  return {
    output: res.content,
    scores,
    inputTokens: res.inputTokens,
    outputTokens: res.outputTokens,
    costUSD: round6(sutCost + sideCostUSD),
    latencyMs: res.latencyMs,
    cacheHit: res.cacheHit,
    stopReason: res.stopReason,
  };
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

async function safeScore<E>(
  scorer: Scorer<string, E>,
  output: string,
  expectation: E,
  ctx: ScorerContext,
): Promise<Score> {
  try {
    return await scorer.score(output, expectation, ctx);
  } catch (err) {
    return {
      scorer: scorer.name,
      value: 0,
      passed: false,
      reason: `scorer threw: ${(err as Error).message}`,
    };
  }
}

function failedSample<E>(scorers: readonly Scorer<string, E>[], err: unknown): CaseSample {
  const reason = err instanceof Error ? err.message : "unknown generation error";
  return {
    output: "",
    scores: scorers.map((s) => ({
      scorer: s.name,
      value: 0,
      passed: false,
      reason: `generation failed: ${reason}`,
    })),
    inputTokens: 0,
    outputTokens: 0,
    costUSD: 0,
    latencyMs: 0,
    cacheHit: false,
    stopReason: null,
  };
}

function aggregateAcrossSamples<E>(
  samples: readonly CaseSample[],
  scorers: readonly Scorer<string, E>[],
): readonly Score[] {
  return scorers.map((scorer) => {
    const matching = samples.flatMap((s) => s.scores.filter((sc) => sc.scorer === scorer.name));
    if (matching.length === 0) {
      return { scorer: scorer.name, value: 0, passed: false, reason: "no samples scored" };
    }
    const mean = matching.reduce((acc, s) => acc + s.value, 0) / matching.length;
    const passRate = matching.filter((s) => s.passed).length / matching.length;
    const passed = passRate >= 0.5;
    return {
      scorer: scorer.name,
      value: round(mean),
      passed,
      ...(samples.length > 1 ? { detail: { passRate, samples: matching.length } } : {}),
    };
  });
}

function summarize(cases: readonly CaseResult[]): RunSummary {
  const totalCases = cases.length;
  const passedCases = cases.filter((c) => c.passed).length;
  const passRate = totalCases === 0 ? 0 : passedCases / totalCases;

  const samples = cases.flatMap((c) => c.samples);
  const totalCostUSD = samples.reduce((acc, s) => acc + s.costUSD, 0);
  const totalInputTokens = samples.reduce((acc, s) => acc + s.inputTokens, 0);
  const totalOutputTokens = samples.reduce((acc, s) => acc + s.outputTokens, 0);

  // Latency stats exclude cache hits (latencyMs=0) so they reflect real model latency.
  const realSamples = samples.filter((s) => !s.cacheHit);
  const latencies = realSamples.map((s) => s.latencyMs).sort((a, b) => a - b);
  const latencyMsP50 = percentile(latencies, 0.5);
  const latencyMsP95 = percentile(latencies, 0.95);

  const cacheHitRate =
    samples.length === 0 ? 0 : samples.filter((s) => s.cacheHit).length / samples.length;

  return {
    totalCases,
    passedCases,
    passRate: round(passRate),
    totalCostUSD: round(totalCostUSD),
    totalInputTokens,
    totalOutputTokens,
    latencyMsP50: round(latencyMsP50),
    latencyMsP95: round(latencyMsP95),
    cacheHitRate: round(cacheHitRate),
  };
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0] ?? 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx] ?? 0;
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}

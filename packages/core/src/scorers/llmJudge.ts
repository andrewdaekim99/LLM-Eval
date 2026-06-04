// llmJudge — the only scorer that hits the network. Goes through the same cached client
// wrapper as everything else (ADR-0006). Treats the judge as fallible (ADR-0007): written
// rubric, structured JSON verdict, bias mitigation via N-sample averaging and a default
// judge model in a different family from the typical SUT.

import { z } from "zod";
import { buildJudgeMessages, JUDGE_SYSTEM_PROMPT } from "../judge/prompts.js";
import type {
  GenerateRequest,
  JudgeVerdict,
  ModelClient,
  ModelId,
  Score,
  Scorer,
  ScorerContext,
} from "../types.js";
import { extractJsonCandidate } from "./jsonSchema.js";

/** Default judge model — different family from the haiku SUT default (anti-self-preference). */
export const DEFAULT_JUDGE_MODEL: ModelId = "claude-sonnet-4-6";

const VerdictPayloadSchema = z.object({
  verdict: z.enum(["pass", "partial", "fail"]),
  score: z.number().min(0).max(1),
  reason: z.string().min(1),
});

type VerdictPayload = z.infer<typeof VerdictPayloadSchema>;

export interface LlmJudgeOptions {
  /** A written rubric. Required — bare "is this good?" is rejected by design (ADR-0007). */
  readonly rubric: string;
  /** Pinned judge model. Defaults to a different family from the typical SUT. */
  readonly judgeModel?: ModelId;
  /** Number of judge invocations per scoring call. Default 1; >1 enables averaging. */
  readonly judgeSamples?: number;
  /** Max tokens for the judge response. The verdict is small; 512 is generous. */
  readonly maxTokens?: number;
  /**
   * Score threshold above which the verdict is `passed`. Independent of the judge's
   * `verdict` field, so the suite can decide how strict to be at the gate.
   */
  readonly passThreshold?: number;
  /**
   * Optional sampling temperature for the judge. Defaults to 0 (deterministic) for
   * single-sample mode and 0.5 for multi-sample (so judgeSamples > 1 actually varies).
   */
  readonly temperature?: number;
}

export function llmJudge<E = unknown>(opts: LlmJudgeOptions): Scorer<string, E> {
  const judgeModel = opts.judgeModel ?? DEFAULT_JUDGE_MODEL;
  const maxTokens = opts.maxTokens ?? 512;
  const passThreshold = opts.passThreshold ?? 0.7;
  const judgeSamples = Math.max(1, opts.judgeSamples ?? 1);
  const temperature = opts.temperature ?? (judgeSamples > 1 ? 0.5 : 0);

  return {
    name: "llmJudge",
    async score(output: string, expectation: E, ctx?: ScorerContext): Promise<Score> {
      if (!ctx?.client) {
        return {
          scorer: "llmJudge",
          value: 0,
          passed: false,
          reason: "llmJudge requires a client in ctx; ensure the runner is passing one",
        };
      }

      const samples: VerdictPayload[] = [];
      const errors: string[] = [];

      for (let i = 0; i < judgeSamples; i++) {
        // sampleMarker makes the cache key differ per pass even though the judge ignores it.
        const messages = buildJudgeMessages({
          rubric: opts.rubric,
          actual: output,
          expected: expectation,
          ...(judgeSamples > 1 && { sampleMarker: `${i + 1}-of-${judgeSamples}` }),
        });

        const req: GenerateRequest = {
          params: {
            model: judgeModel,
            maxTokens,
            temperature,
            system: JUDGE_SYSTEM_PROMPT,
          },
          messages,
        };

        const verdict = await runOneJudge(ctx.client, req);
        if (verdict.ok) {
          samples.push(verdict.value);
          // Report judge token usage so the runner can include it in the sample's costUSD.
          ctx.recordSideCost?.({
            model: judgeModel,
            inputTokens: verdict.inputTokens,
            outputTokens: verdict.outputTokens,
          });
        } else {
          errors.push(verdict.error);
        }
      }

      if (samples.length === 0) {
        return {
          scorer: "llmJudge",
          value: 0,
          passed: false,
          reason: `judge produced no parseable verdicts (${judgeSamples} attempts): ${errors[0] ?? "unknown"}`,
        };
      }

      const aggregated = aggregateVerdicts(samples);
      const judgeVerdict: JudgeVerdict = {
        verdict: aggregated.verdict,
        score: aggregated.score,
        reason: aggregated.reason,
        rubric: opts.rubric,
        judgeModel,
        samples: samples.map((s) => ({
          score: s.score,
          verdict: s.verdict,
          reason: s.reason,
        })),
      };

      const passed = aggregated.score >= passThreshold;
      return {
        scorer: "llmJudge",
        value: round(aggregated.score),
        passed,
        ...(passed ? {} : { reason: aggregated.reason }),
        detail: { ...judgeVerdict, variance: round(aggregated.variance) },
      };
    },
  };
}

interface AggregatedVerdict {
  readonly verdict: "pass" | "partial" | "fail";
  readonly score: number;
  readonly reason: string;
  readonly variance: number;
}

/**
 * Aggregate N judge verdicts into a single score: mean of scores, mode of verdicts,
 * reason picked from the median-scored sample. Exposes variance so the suite/gate
 * can flag noisy judging.
 */
export function aggregateVerdicts(samples: readonly VerdictPayload[]): AggregatedVerdict {
  if (samples.length === 0) {
    throw new Error("aggregateVerdicts requires at least one sample");
  }
  if (samples.length === 1) {
    const only = samples[0];
    if (!only) throw new Error("unreachable");
    return { verdict: only.verdict, score: only.score, reason: only.reason, variance: 0 };
  }

  const scores = samples.map((s) => s.score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length;

  // Mode of verdicts; tie-break by sticking with whichever the mean lands in.
  const counts: Record<string, number> = {};
  for (const s of samples) counts[s.verdict] = (counts[s.verdict] ?? 0) + 1;
  const sortedVerdicts = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const modeVerdictFromCount = sortedVerdicts[0]?.[0];
  const modeVerdict =
    modeVerdictFromCount === "pass" ||
    modeVerdictFromCount === "partial" ||
    modeVerdictFromCount === "fail"
      ? modeVerdictFromCount
      : "partial";

  // Reason from the sample whose score is closest to the mean (median-ish behavior).
  const closest = [...samples].sort(
    (a, b) => Math.abs(a.score - mean) - Math.abs(b.score - mean),
  )[0];
  const reason = closest?.reason ?? samples[0]?.reason ?? "";

  return { verdict: modeVerdict, score: mean, reason, variance };
}

async function runOneJudge(
  client: ModelClient,
  req: GenerateRequest,
): Promise<
  | { ok: true; value: VerdictPayload; inputTokens: number; outputTokens: number }
  | { ok: false; error: string }
> {
  let raw: string;
  let inputTokens = 0;
  let outputTokens = 0;
  try {
    const res = await client.generate(req);
    raw = res.content;
    inputTokens = res.inputTokens;
    outputTokens = res.outputTokens;
  } catch (err) {
    return { ok: false, error: `judge call failed: ${(err as Error).message}` };
  }

  const candidate = extractJsonCandidate(raw);
  if (!candidate) {
    return { ok: false, error: "judge produced no JSON object" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (err) {
    return { ok: false, error: `judge JSON parse error: ${(err as Error).message}` };
  }

  const result = VerdictPayloadSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      error: `judge verdict missing required fields: ${result.error.issues[0]?.message ?? "unknown"}`,
    };
  }

  return { ok: true, value: result.data, inputTokens, outputTokens };
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export const _testing = { VerdictPayloadSchema, aggregateVerdicts };

// Public domain types for Yardstick. These are intentionally provider-agnostic — only the
// concrete `ModelClient` implementation in `client.ts` knows about Anthropic (ADR-0001).
//
// Naming follows PROJECT_DIRECTION.md: Suite, Case, Scorer, Score, RunResult, JudgeVerdict.

import type { z } from "zod";

/** A pinned Claude model snapshot ID. Aliases are rejected at config-load (ADR-0005). */
export type ModelId = string;

/** Generation parameters that participate in the cache key (ADR-0004). */
export interface GenerationParams {
  readonly model: ModelId;
  readonly maxTokens: number;
  readonly temperature?: number;
  readonly topP?: number;
  readonly stopSequences?: readonly string[];
  readonly system?: string;
}

/** A single message in a Claude request. Mirrors the Messages API shape. */
export interface Message {
  readonly role: "user" | "assistant";
  readonly content: string;
}

/** A request to the model client. The cache key is derived from this object. */
export interface GenerateRequest {
  readonly params: GenerationParams;
  readonly messages: readonly Message[];
}

/** A response from the model client. */
export interface GenerateResponse {
  readonly content: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly model: ModelId;
  readonly stopReason: string | null;
  readonly cacheHit: boolean;
  readonly latencyMs: number;
}

/** The pluggable transport seam — tests inject a fake here. */
export interface ModelTransport {
  call(req: GenerateRequest): Promise<Omit<GenerateResponse, "cacheHit" | "latencyMs">>;
}

/** The model client interface used everywhere in `core`. */
export interface ModelClient {
  generate(req: GenerateRequest): Promise<GenerateResponse>;
}

/** The output of a single scorer against a single case. */
export interface Score {
  readonly scorer: string;
  /** 0..1 where 1 is perfect. Booleans coerce to 0/1. */
  readonly value: number;
  readonly passed: boolean;
  readonly reason?: string;
  /** Optional structured detail (e.g., field-level breakdown). */
  readonly detail?: unknown;
}

/** A pure-function scorer (ADR-0006). `llmJudge` is the documented exception. */
export interface Scorer<TOutput = string, TExpectation = unknown> {
  readonly name: string;
  score(output: TOutput, expectation: TExpectation): Score | Promise<Score>;
}

/** The structured verdict returned by `llmJudge`. */
export interface JudgeVerdict {
  readonly verdict: "pass" | "fail" | "partial";
  /** 0..1 normalized score across samples. */
  readonly score: number;
  readonly reason: string;
  readonly rubric: string;
  readonly judgeModel: ModelId;
  readonly samples: readonly { score: number; verdict: string; reason: string }[];
}

/** A single case within a suite. */
export interface Case<TInput = unknown, TExpectation = unknown> {
  readonly id: string;
  readonly input: TInput;
  readonly expectation: TExpectation;
  /** Optional per-case override of the suite's generation params. */
  readonly params?: Partial<GenerationParams>;
  /** Optional sample count for pass@k (ADR-0009). Defaults to 1. */
  readonly samples?: number;
  readonly tags?: readonly string[];
}

/** Builds the prompt sent to the model from a case's input. */
export type PromptBuilder<TInput = unknown> = (input: TInput) => readonly Message[];

/** A suite is the unit of evaluation. */
export interface Suite<TInput = unknown, TExpectation = unknown> {
  readonly name: string;
  /** Version string for the prompt — bumped intentionally to mark a new run lineage. */
  readonly promptVersion: string;
  readonly params: GenerationParams;
  readonly buildPrompt: PromptBuilder<TInput>;
  readonly cases: readonly Case<TInput, TExpectation>[];
  readonly scorers: readonly Scorer<string, TExpectation>[];
  /** Optional thresholds for the CI gate (Phase 3). */
  readonly thresholds?: SuiteThresholds;
}

export interface SuiteThresholds {
  readonly passRate?: number;
  readonly passAtK?: number;
  readonly maxCostUSD?: number;
  readonly maxLatencyMsP95?: number;
}

/** The result of running a single case (one or many samples). */
export interface CaseResult {
  readonly caseId: string;
  readonly samples: readonly CaseSample[];
  readonly aggregateScores: readonly Score[];
  readonly passed: boolean;
}

export interface CaseSample {
  readonly output: string;
  readonly scores: readonly Score[];
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUSD: number;
  readonly latencyMs: number;
  readonly cacheHit: boolean;
  readonly stopReason: string | null;
}

/** The artifact produced by a run. Immutable (ADR-0008). */
export interface RunResult {
  readonly runId: string;
  readonly suite: string;
  readonly promptVersion: string;
  readonly model: ModelId;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly cases: readonly CaseResult[];
  readonly summary: RunSummary;
}

export interface RunSummary {
  readonly totalCases: number;
  readonly passedCases: number;
  readonly passRate: number;
  readonly totalCostUSD: number;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly latencyMsP50: number;
  readonly latencyMsP95: number;
  readonly cacheHitRate: number;
}

/** Errors the runner distinguishes between (terminal vs retryable). */
export class ConfigError extends Error {
  override readonly name = "ConfigError";
}

export class RetryableError extends Error {
  override readonly name = "RetryableError";
}

/** Re-export helper for callers building zod-typed suites. */
export type Infer<T extends z.ZodTypeAny> = z.infer<T>;

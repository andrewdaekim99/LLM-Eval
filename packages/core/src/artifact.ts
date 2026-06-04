// On-disk artifact format. Runs are immutable (ADR-0008), and every artifact carries a
// schema version so future migrations can read older runs without guessing.
//
// Schema v2 (ADR-0016): each case embeds `input` and `expectation` so artifacts are
// fully self-describing. v1 artifacts on disk are migrated in-memory via `migrateArtifact`.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { z } from "zod";
import type { RunResult } from "./types.js";

export const ARTIFACT_SCHEMA_VERSION = 2 as const;

const ScoreSchema = z.object({
  scorer: z.string(),
  value: z.number(),
  passed: z.boolean(),
  reason: z.string().optional(),
  detail: z.unknown().optional(),
});

const CaseSampleSchema = z.object({
  output: z.string(),
  scores: z.array(ScoreSchema),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  costUSD: z.number().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
  cacheHit: z.boolean(),
  stopReason: z.string().nullable(),
});

const CaseResultSchema = z.object({
  caseId: z.string(),
  input: z.unknown(),
  expectation: z.unknown(),
  samples: z.array(CaseSampleSchema),
  aggregateScores: z.array(ScoreSchema),
  passed: z.boolean(),
});

const RunSummarySchema = z.object({
  totalCases: z.number().int().nonnegative(),
  passedCases: z.number().int().nonnegative(),
  passRate: z.number(),
  totalCostUSD: z.number().nonnegative(),
  totalInputTokens: z.number().int().nonnegative(),
  totalOutputTokens: z.number().int().nonnegative(),
  latencyMsP50: z.number().nonnegative(),
  latencyMsP95: z.number().nonnegative(),
  cacheHitRate: z.number(),
});

export const RunArtifactSchema = z.object({
  schemaVersion: z.literal(ARTIFACT_SCHEMA_VERSION),
  runId: z.string(),
  suite: z.string(),
  promptVersion: z.string(),
  model: z.string(),
  startedAt: z.string(),
  finishedAt: z.string(),
  cases: z.array(CaseResultSchema),
  summary: RunSummarySchema,
});

export type RunArtifact = z.infer<typeof RunArtifactSchema>;

/** The v1 case shape — same as v2 minus input/expectation. */
const V1CaseResultSchema = z.object({
  caseId: z.string(),
  samples: z.array(CaseSampleSchema),
  aggregateScores: z.array(ScoreSchema),
  passed: z.boolean(),
});

const V1ArtifactSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string(),
  suite: z.string(),
  promptVersion: z.string(),
  model: z.string(),
  startedAt: z.string(),
  finishedAt: z.string(),
  cases: z.array(V1CaseResultSchema),
  summary: RunSummarySchema,
});

/** Convert a `RunResult` to its on-disk `RunArtifact` form. */
export function toArtifact(run: RunResult): RunArtifact {
  return {
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    runId: run.runId,
    suite: run.suite,
    promptVersion: run.promptVersion,
    model: run.model,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    cases: run.cases.map((c) => ({
      caseId: c.caseId,
      input: c.input,
      expectation: c.expectation,
      passed: c.passed,
      aggregateScores: c.aggregateScores.map(toPlainScore),
      samples: c.samples.map((s) => ({
        output: s.output,
        scores: s.scores.map(toPlainScore),
        inputTokens: s.inputTokens,
        outputTokens: s.outputTokens,
        costUSD: s.costUSD,
        latencyMs: s.latencyMs,
        cacheHit: s.cacheHit,
        stopReason: s.stopReason,
      })),
    })),
    summary: { ...run.summary },
  };
}

function toPlainScore(s: {
  scorer: string;
  value: number;
  passed: boolean;
  reason?: string;
  detail?: unknown;
}): z.infer<typeof ScoreSchema> {
  return {
    scorer: s.scorer,
    value: s.value,
    passed: s.passed,
    ...(s.reason !== undefined && { reason: s.reason }),
    ...(s.detail !== undefined && { detail: s.detail }),
  };
}

/**
 * Parse an artifact JSON value, automatically upgrading older schema versions to the
 * current shape. Use this anywhere you read artifacts (DB rebuild, dashboard, diff).
 *
 * Throws a clear error on unknown schema versions rather than silently dropping data.
 */
export function migrateArtifact(raw: unknown): RunArtifact {
  if (typeof raw !== "object" || raw === null || !("schemaVersion" in raw)) {
    throw new Error("not a yardstick artifact (missing schemaVersion)");
  }
  const version = (raw as Record<string, unknown>).schemaVersion;

  if (version === ARTIFACT_SCHEMA_VERSION) {
    return RunArtifactSchema.parse(raw);
  }

  if (version === 1) {
    const v1 = V1ArtifactSchema.parse(raw);
    // v1 didn't track input/expectation — there's no way to recover them after the fact,
    // so we store `null` placeholders. The dashboard will show "(input not captured)".
    const upgraded: RunArtifact = {
      ...v1,
      schemaVersion: ARTIFACT_SCHEMA_VERSION,
      cases: v1.cases.map((c) => ({
        ...c,
        input: null,
        expectation: null,
      })),
    };
    return RunArtifactSchema.parse(upgraded);
  }

  throw new Error(
    `unsupported artifact schemaVersion: ${String(version)} (this binary supports v1 and v${ARTIFACT_SCHEMA_VERSION})`,
  );
}

/** Read an artifact from disk and migrate to the current schema. */
export async function readArtifact(path: string): Promise<RunArtifact> {
  const raw = await readFile(path, "utf8");
  return migrateArtifact(JSON.parse(raw));
}

/**
 * Filename: `<YYYY-MM-DDTHHMMSS>-<suite>-<promptVersion>.json`.
 * Both the suite and promptVersion are slugified so the path is always safe.
 */
export function artifactPath(opts: {
  outputDir: string;
  suite: string;
  promptVersion: string;
  startedAt: string;
}): string {
  const stamp = opts.startedAt.replace(/[:.]/g, "").replace(/-/g, "").replace("Z", "");
  // 20260604T164822 — sortable and filename-safe.
  const compact = `${stamp.slice(0, 8)}T${stamp.slice(9, 15)}`;
  const suite = slug(opts.suite);
  const version = slug(opts.promptVersion);
  return resolve(opts.outputDir, `${compact}-${suite}-${version}.json`);
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function writeArtifact(artifact: RunArtifact, path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
}

/**
 * Default placement helper used by the CLI: `<outputDir>/<filename>`.
 * Returns the absolute path that was written.
 */
export async function persistArtifact(
  run: RunResult,
  outputDir: string,
): Promise<{ artifact: RunArtifact; path: string }> {
  const artifact = toArtifact(run);
  const path = artifactPath({
    outputDir,
    suite: run.suite,
    promptVersion: run.promptVersion,
    startedAt: run.startedAt,
  });
  await writeArtifact(artifact, path);
  return { artifact, path };
}

export const _testing = {
  slug,
  artifactPath: (o: Parameters<typeof artifactPath>[0]) => artifactPath(o),
  join,
};

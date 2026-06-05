import "server-only";

import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import {
  diffCases,
  meanScoreValue,
  readArtifact,
  type CaseDiff,
  type CaseHistoryEntry,
  type RunArtifact,
  type RunListEntry,
  type StoredCase,
  type StoredJudgeVerdict,
  type StoredSample,
} from "@yardstick/core";
import { getDb } from "./db";

export interface ListRunsFilter {
  suite?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export interface RunDetail {
  summary: RunListEntry;
  cases: StoredCase[];
  artifact: RunArtifact | null;
}

export interface CaseDetail {
  case: StoredCase;
  samples: StoredSample[];
  verdicts: StoredJudgeVerdict[];
}

export interface TrendPoint {
  runId: string;
  startedAt: string;
  passRate: number;
  costUSD: number;
  latencyP95: number;
  cacheHitRate: number;
}

export interface DiffReport {
  a: RunListEntry;
  b: RunListEntry;
  diffs: readonly CaseDiff[];
  passRateDelta: number;
  costDelta: number;
  latencyP95Delta: number;
}

export function listSuites(): string[] {
  return getDb().listSuites();
}

export function listRuns(filter: ListRunsFilter = {}): RunListEntry[] {
  return getDb().listRuns({
    suite: filter.suite,
    from: filter.from,
    to: filter.to,
    limit: filter.limit ?? 100,
  });
}

export async function getRun(runId: string): Promise<RunDetail | null> {
  const db = getDb();
  const resolved = resolveRunId(runId);
  if (!resolved) return null;

  const summary = db.getRunSummary(resolved);
  if (!summary) return null;

  const cases = db.getCases(resolved);
  // `artifact_path` is best-effort — if the JSON has been moved/deleted, the DB
  // is still the source of truth and we just don't return the raw artifact.
  const artifact = summary.artifactPath
    ? await safeReadArtifact(summary.artifactPath)
    : null;
  return { summary, cases, artifact };
}

export function getCase(runId: string, caseId: string): CaseDetail | null {
  const db = getDb();
  const resolved = resolveRunId(runId);
  if (!resolved) return null;

  const cases = db.getCases(resolved);
  const target = cases.find((c) => c.caseId === caseId);
  if (!target) return null;

  return {
    case: target,
    samples: db.getSamples(resolved, caseId),
    verdicts: db.getJudgeVerdicts(resolved, caseId),
  };
}

export function getSuiteTrend(
  suite: string,
  opts: { from?: string; to?: string } = {},
): TrendPoint[] {
  const runs = getDb().listRuns({ suite, from: opts.from, to: opts.to, limit: 200 });
  return [...runs]
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    .map((r) => ({
      runId: r.runId,
      startedAt: r.startedAt,
      passRate: r.passRate,
      costUSD: r.totalCostUSD,
      latencyP95: r.latencyMsP95,
      cacheHitRate: r.cacheHitRate,
    }));
}

export function getDiff(runIdA: string, runIdB: string): DiffReport | null {
  const db = getDb();
  const idA = resolveRunId(runIdA);
  const idB = resolveRunId(runIdB);
  if (!idA || !idB) return null;

  const a = db.getRunSummary(idA);
  const b = db.getRunSummary(idB);
  if (!a || !b) return null;

  const casesA = db.getCases(idA);
  const casesB = db.getCases(idB);
  const diffs = diffCases(casesA, casesB);

  return {
    a,
    b,
    diffs,
    passRateDelta: b.passRate - a.passRate,
    costDelta: b.totalCostUSD - a.totalCostUSD,
    latencyP95Delta: b.latencyMsP95 - a.latencyMsP95,
  };
}

export interface PriorPassingRun {
  runId: string;
  startedAt: string;
  promptVersion: string;
  model: string;
  case: StoredCase;
  samples: StoredSample[];
}

/**
 * Find the most recent passing run for `caseId` in `suite` strictly before
 * `beforeStartedAt`. Used by the drill-down to compare a regressed case
 * against the last time it passed.
 */
export function getPriorPassingRun(
  suite: string,
  caseId: string,
  beforeStartedAt: string,
): PriorPassingRun | null {
  const db = getDb();
  const history = db.getCaseHistory(suite, caseId, beforeStartedAt);
  const prior = history.find((h) => h.passed);
  if (!prior) return null;

  const cases = db.getCases(prior.runId);
  const target = cases.find((c) => c.caseId === caseId);
  if (!target) return null;

  return {
    runId: prior.runId,
    startedAt: prior.startedAt,
    promptVersion: prior.promptVersion,
    model: prior.model,
    case: target,
    samples: db.getSamples(prior.runId, caseId),
  };
}

export function resolveRunId(prefixOrId: string): string | null {
  if (prefixOrId.length >= 32) return prefixOrId; // full UUID
  const res = getDb().resolveRunIdPrefix(prefixOrId);
  return res.ok ? res.runId : null;
}

export { meanScoreValue };

async function safeReadArtifact(path: string): Promise<RunArtifact | null> {
  try {
    const resolved = resolveArtifactPath(path);
    return await readArtifact(resolved);
  } catch {
    return null;
  }
}

function resolveArtifactPath(p: string): string {
  if (isAbsolute(p)) return p;
  const root = findWorkspaceRoot(process.cwd()) ?? process.cwd();
  return resolve(root, p);
}

function findWorkspaceRoot(start: string): string | null {
  let dir = start;
  while (true) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export type {
  CaseDiff,
  CaseHistoryEntry,
  RunArtifact,
  RunListEntry,
  StoredCase,
  StoredJudgeVerdict,
  StoredSample,
};

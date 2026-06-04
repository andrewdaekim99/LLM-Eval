// SQLite history (better-sqlite3). The DB is a queryable index over the canonical
// JSON artifacts on disk; it can be wiped and rebuilt at any time (`yardstick rebuild-db`)
// without losing data. Schema is created idempotently at open time.
//
// Four tables (ADR-0001 wording from ROADMAP §Phase-2):
//   runs            — one row per run, denormalized summary for fast listing
//   cases           — one row per (run, case) with input/expectation/aggregate scores
//   samples         — one row per (run, case, sample) with output + tokens + cost + latency
//   judge_verdicts  — one row per llmJudge invocation, for verdict-axis queries

import Database, { type Database as DBInstance, type Statement } from "better-sqlite3";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { childLogger } from "./logger.js";
import type { RunArtifact } from "./artifact.js";
import type { JudgeVerdict } from "./types.js";

const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS runs (
  run_id              TEXT PRIMARY KEY,
  suite               TEXT NOT NULL,
  prompt_version      TEXT NOT NULL,
  model               TEXT NOT NULL,
  started_at          TEXT NOT NULL,
  finished_at         TEXT NOT NULL,
  schema_version      INTEGER NOT NULL,
  total_cases         INTEGER NOT NULL,
  passed_cases        INTEGER NOT NULL,
  pass_rate           REAL NOT NULL,
  total_cost_usd      REAL NOT NULL,
  total_input_tokens  INTEGER NOT NULL,
  total_output_tokens INTEGER NOT NULL,
  latency_ms_p50      REAL NOT NULL,
  latency_ms_p95      REAL NOT NULL,
  cache_hit_rate      REAL NOT NULL,
  artifact_path       TEXT
);

CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_runs_suite_started ON runs(suite, started_at DESC);

CREATE TABLE IF NOT EXISTS cases (
  run_id                TEXT NOT NULL,
  case_id               TEXT NOT NULL,
  input_json            TEXT NOT NULL,
  expectation_json      TEXT NOT NULL,
  passed                INTEGER NOT NULL,
  aggregate_scores_json TEXT NOT NULL,
  PRIMARY KEY (run_id, case_id),
  FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS samples (
  run_id        TEXT NOT NULL,
  case_id       TEXT NOT NULL,
  sample_index  INTEGER NOT NULL,
  output        TEXT NOT NULL,
  scores_json   TEXT NOT NULL,
  input_tokens  INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd      REAL NOT NULL,
  latency_ms    INTEGER NOT NULL,
  cache_hit     INTEGER NOT NULL,
  stop_reason   TEXT,
  PRIMARY KEY (run_id, case_id, sample_index),
  FOREIGN KEY (run_id, case_id) REFERENCES cases(run_id, case_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS judge_verdicts (
  run_id            TEXT NOT NULL,
  case_id           TEXT NOT NULL,
  sample_index      INTEGER NOT NULL,
  scorer            TEXT NOT NULL,
  verdict           TEXT NOT NULL,
  score             REAL NOT NULL,
  reason            TEXT NOT NULL,
  rubric            TEXT NOT NULL,
  judge_model       TEXT NOT NULL,
  judge_samples_json TEXT NOT NULL,
  PRIMARY KEY (run_id, case_id, sample_index, scorer),
  FOREIGN KEY (run_id, case_id, sample_index)
    REFERENCES samples(run_id, case_id, sample_index) ON DELETE CASCADE
);
`;

export interface RunListEntry {
  readonly runId: string;
  readonly suite: string;
  readonly promptVersion: string;
  readonly model: string;
  readonly startedAt: string;
  readonly totalCases: number;
  readonly passedCases: number;
  readonly passRate: number;
  readonly totalCostUSD: number;
  readonly latencyMsP95: number;
  readonly cacheHitRate: number;
  readonly artifactPath: string | null;
}

export interface ListRunsOptions {
  readonly suite?: string;
  readonly limit?: number;
}

export class HistoryDb {
  private readonly db: DBInstance;
  private readonly log = childLogger({ component: "db" });
  private readonly stmts: ReturnType<typeof prepareStatements>;

  constructor(opts: { path: string }) {
    if (opts.path !== ":memory:") {
      mkdirSync(dirname(opts.path), { recursive: true });
    }
    this.db = new Database(opts.path);
    this.db.exec(SCHEMA_SQL);
    this.stmts = prepareStatements(this.db);
    this.log.debug({ path: opts.path }, "history db opened");
  }

  close(): void {
    this.db.close();
  }

  /**
   * Insert (or replace) a run + all its cases, samples, and judge verdicts.
   * Wrapped in a transaction so partial inserts can't leave the DB in a bad state.
   * Idempotent: re-inserting the same run replaces it (cascades clean up children).
   */
  insertRun(artifact: RunArtifact, artifactPath: string | null = null): void {
    const tx = this.db.transaction(() => {
      // Delete first so ON DELETE CASCADE clears children.
      this.stmts.deleteRun.run(artifact.runId);
      this.stmts.insertRun.run({
        run_id: artifact.runId,
        suite: artifact.suite,
        prompt_version: artifact.promptVersion,
        model: artifact.model,
        started_at: artifact.startedAt,
        finished_at: artifact.finishedAt,
        schema_version: artifact.schemaVersion,
        total_cases: artifact.summary.totalCases,
        passed_cases: artifact.summary.passedCases,
        pass_rate: artifact.summary.passRate,
        total_cost_usd: artifact.summary.totalCostUSD,
        total_input_tokens: artifact.summary.totalInputTokens,
        total_output_tokens: artifact.summary.totalOutputTokens,
        latency_ms_p50: artifact.summary.latencyMsP50,
        latency_ms_p95: artifact.summary.latencyMsP95,
        cache_hit_rate: artifact.summary.cacheHitRate,
        artifact_path: artifactPath,
      });

      for (const c of artifact.cases) {
        this.stmts.insertCase.run({
          run_id: artifact.runId,
          case_id: c.caseId,
          input_json: JSON.stringify(c.input),
          expectation_json: JSON.stringify(c.expectation),
          passed: c.passed ? 1 : 0,
          aggregate_scores_json: JSON.stringify(c.aggregateScores),
        });

        for (let i = 0; i < c.samples.length; i++) {
          const s = c.samples[i];
          if (!s) continue;
          this.stmts.insertSample.run({
            run_id: artifact.runId,
            case_id: c.caseId,
            sample_index: i,
            output: s.output,
            scores_json: JSON.stringify(s.scores),
            input_tokens: s.inputTokens,
            output_tokens: s.outputTokens,
            cost_usd: s.costUSD,
            latency_ms: s.latencyMs,
            cache_hit: s.cacheHit ? 1 : 0,
            stop_reason: s.stopReason,
          });

          for (const score of s.scores) {
            const judge = extractJudgeVerdict(score);
            if (judge) {
              this.stmts.insertJudge.run({
                run_id: artifact.runId,
                case_id: c.caseId,
                sample_index: i,
                scorer: score.scorer,
                verdict: judge.verdict,
                score: judge.score,
                reason: judge.reason,
                rubric: judge.rubric,
                judge_model: judge.judgeModel,
                judge_samples_json: JSON.stringify(judge.samples),
              });
            }
          }
        }
      }
    });

    tx();
  }

  listRuns(opts: ListRunsOptions = {}): RunListEntry[] {
    const limit = opts.limit ?? 50;
    const rows = opts.suite
      ? this.stmts.listBySuite.all({ suite: opts.suite, lim: limit })
      : this.stmts.listAll.all({ lim: limit });
    return (rows as RunRow[]).map(rowToListEntry);
  }

  getRunSummary(runId: string): RunListEntry | null {
    const row = this.stmts.getRun.get({ run_id: runId }) as RunRow | undefined;
    return row ? rowToListEntry(row) : null;
  }

  countRuns(): number {
    const row = this.stmts.countRuns.get() as { c: number };
    return row.c;
  }

  /** Read access for callers that want raw case-level data (used by `yardstick diff`). */
  getCases(runId: string): StoredCase[] {
    const rows = this.stmts.getCases.all({ run_id: runId }) as StoredCaseRow[];
    return rows.map(rowToStoredCase);
  }

  /**
   * Resolve a run-id prefix to its full ID. Returns `{ ok: true, runId }` on a unique
   * match, or `{ ok: false }` with the list of candidates so the CLI can render them.
   */
  resolveRunIdPrefix(
    prefix: string,
  ): { ok: true; runId: string } | { ok: false; candidates: string[] } {
    if (prefix.length < 4) {
      return { ok: false, candidates: [] };
    }
    const rows = this.stmts.findByPrefix.all({ pref: `${prefix}%` }) as { run_id: string }[];
    if (rows.length === 1 && rows[0]) return { ok: true, runId: rows[0].run_id };
    return { ok: false, candidates: rows.map((r) => r.run_id) };
  }

  deleteRun(runId: string): void {
    this.stmts.deleteRun.run(runId);
  }
}

interface RunRow {
  run_id: string;
  suite: string;
  prompt_version: string;
  model: string;
  started_at: string;
  total_cases: number;
  passed_cases: number;
  pass_rate: number;
  total_cost_usd: number;
  latency_ms_p95: number;
  cache_hit_rate: number;
  artifact_path: string | null;
}

interface StoredCaseRow {
  case_id: string;
  input_json: string;
  expectation_json: string;
  passed: number;
  aggregate_scores_json: string;
}

export interface StoredCase {
  readonly caseId: string;
  readonly input: unknown;
  readonly expectation: unknown;
  readonly passed: boolean;
  readonly aggregateScores: readonly StoredScore[];
}

export interface StoredScore {
  readonly scorer: string;
  readonly value: number;
  readonly passed: boolean;
  readonly reason?: string;
  readonly detail?: unknown;
}

function rowToListEntry(r: RunRow): RunListEntry {
  return {
    runId: r.run_id,
    suite: r.suite,
    promptVersion: r.prompt_version,
    model: r.model,
    startedAt: r.started_at,
    totalCases: r.total_cases,
    passedCases: r.passed_cases,
    passRate: r.pass_rate,
    totalCostUSD: r.total_cost_usd,
    latencyMsP95: r.latency_ms_p95,
    cacheHitRate: r.cache_hit_rate,
    artifactPath: r.artifact_path,
  };
}

function rowToStoredCase(r: StoredCaseRow): StoredCase {
  return {
    caseId: r.case_id,
    input: safeParseJson(r.input_json),
    expectation: safeParseJson(r.expectation_json),
    passed: r.passed === 1,
    aggregateScores: safeParseJson(r.aggregate_scores_json) as StoredScore[],
  };
}

function safeParseJson(s: string): unknown {
  try {
    return JSON.parse(s) as unknown;
  } catch {
    return null;
  }
}

/**
 * Pull a `JudgeVerdict` out of a score's `detail` when the score is an llmJudge entry.
 * Returns null for non-judge scores so the persister can keep its single-pass loop.
 */
function extractJudgeVerdict(score: { scorer: string; detail?: unknown }): JudgeVerdict | null {
  if (score.scorer !== "llmJudge" || !score.detail || typeof score.detail !== "object") {
    return null;
  }
  const d = score.detail as Partial<JudgeVerdict>;
  if (
    typeof d.verdict !== "string" ||
    typeof d.score !== "number" ||
    typeof d.reason !== "string" ||
    typeof d.rubric !== "string" ||
    typeof d.judgeModel !== "string" ||
    !Array.isArray(d.samples)
  ) {
    return null;
  }
  return d as JudgeVerdict;
}

function prepareStatements(db: DBInstance): PreparedStatements {
  return {
    deleteRun: db.prepare("DELETE FROM runs WHERE run_id = ?"),
    insertRun: db.prepare(`
      INSERT INTO runs (
        run_id, suite, prompt_version, model, started_at, finished_at, schema_version,
        total_cases, passed_cases, pass_rate, total_cost_usd, total_input_tokens,
        total_output_tokens, latency_ms_p50, latency_ms_p95, cache_hit_rate, artifact_path
      ) VALUES (
        @run_id, @suite, @prompt_version, @model, @started_at, @finished_at, @schema_version,
        @total_cases, @passed_cases, @pass_rate, @total_cost_usd, @total_input_tokens,
        @total_output_tokens, @latency_ms_p50, @latency_ms_p95, @cache_hit_rate, @artifact_path
      )
    `),
    insertCase: db.prepare(`
      INSERT INTO cases (
        run_id, case_id, input_json, expectation_json, passed, aggregate_scores_json
      ) VALUES (
        @run_id, @case_id, @input_json, @expectation_json, @passed, @aggregate_scores_json
      )
    `),
    insertSample: db.prepare(`
      INSERT INTO samples (
        run_id, case_id, sample_index, output, scores_json,
        input_tokens, output_tokens, cost_usd, latency_ms, cache_hit, stop_reason
      ) VALUES (
        @run_id, @case_id, @sample_index, @output, @scores_json,
        @input_tokens, @output_tokens, @cost_usd, @latency_ms, @cache_hit, @stop_reason
      )
    `),
    insertJudge: db.prepare(`
      INSERT INTO judge_verdicts (
        run_id, case_id, sample_index, scorer, verdict, score, reason,
        rubric, judge_model, judge_samples_json
      ) VALUES (
        @run_id, @case_id, @sample_index, @scorer, @verdict, @score, @reason,
        @rubric, @judge_model, @judge_samples_json
      )
    `),
    listAll: db.prepare(`
      SELECT run_id, suite, prompt_version, model, started_at,
             total_cases, passed_cases, pass_rate, total_cost_usd,
             latency_ms_p95, cache_hit_rate, artifact_path
      FROM runs
      ORDER BY started_at DESC
      LIMIT @lim
    `),
    listBySuite: db.prepare(`
      SELECT run_id, suite, prompt_version, model, started_at,
             total_cases, passed_cases, pass_rate, total_cost_usd,
             latency_ms_p95, cache_hit_rate, artifact_path
      FROM runs
      WHERE suite = @suite
      ORDER BY started_at DESC
      LIMIT @lim
    `),
    getRun: db.prepare(`
      SELECT run_id, suite, prompt_version, model, started_at,
             total_cases, passed_cases, pass_rate, total_cost_usd,
             latency_ms_p95, cache_hit_rate, artifact_path
      FROM runs WHERE run_id = @run_id
    `),
    countRuns: db.prepare("SELECT COUNT(*) AS c FROM runs"),
    getCases: db.prepare(`
      SELECT case_id, input_json, expectation_json, passed, aggregate_scores_json
      FROM cases WHERE run_id = @run_id ORDER BY case_id
    `),
    findByPrefix: db.prepare("SELECT run_id FROM runs WHERE run_id LIKE @pref LIMIT 20"),
  };
}

interface PreparedStatements {
  deleteRun: Statement;
  insertRun: Statement;
  insertCase: Statement;
  insertSample: Statement;
  insertJudge: Statement;
  listAll: Statement;
  listBySuite: Statement;
  getRun: Statement;
  countRuns: Statement;
  getCases: Statement;
  findByPrefix: Statement;
}

# @yardstick/core

Core library for Yardstick: domain types, the runner, scorers, the cached Anthropic client,
the pricing table, env config, and the on-disk artifact writer. Provider-agnostic at the
interface level (only the Claude adapter ships — see `DECISIONS.md` ADR-0001).

## Public surface

### Types

`Suite`, `Case`, `Scorer`, `Score`, `JudgeVerdict`, `RunResult`, `CaseResult`, `CaseSample`,
`RunSummary`, `GenerateRequest`, `GenerateResponse`, `ModelClient`, `ModelTransport`,
`ConfigError`, `RetryableError`.

### Config

- `loadConfig(env?)` — zod-validates env vars; rejects alias model IDs at startup (ADR-0005).

### Client

- `CachedModelClient` — disk-cached `ModelClient`. Cache key = `(model, prompt, input, params)`.
- `AnthropicTransport` — concrete transport wrapping `@anthropic-ai/sdk`.
- `cacheKey(req)` — deterministic SHA-256 derivation for inspection / tests.

### Scorers

Pure `(output, expectation, ctx?) -> Score` (ADR-0006). `llmJudge` is the documented
exception that hits the network — via the same cached client, through `ctx.client`.

- `exactMatch({ trim?, caseInsensitive? })` — string equality.
- `contains({ caseInsensitive? })` — substring match; expectation = needle.
- `regex(pattern)` — `RegExp.test(output)`; expectation unused.
- `jsonSchema(schema)` — output must parse as JSON conforming to a zod schema. Tolerates
  ` ```json ` fenced output and prose surrounding the JSON block.
- `fieldAccuracy({ schema?, trimStrings?, caseInsensitive?, ignore?, passThreshold? })` —
  per-field equality with partial credit; expectation = the expected object.
- `llmJudge({ rubric, judgeModel?, judgeSamples?, passThreshold? })` — rubric-driven judge
  with structured JSON verdict. Defaults to `claude-sonnet-4-6` (different family from the
  haiku SUT default → anti-self-preference, ADR-0007). When `judgeSamples > 1`, makes N
  calls with a per-call cache-bookkeeping marker, then aggregates by mean score, mode
  verdict, median-closest reason, and reports variance in `detail.variance`.

### Judge prompt template

`src/judge/prompts.ts` exposes `JUDGE_SYSTEM_PROMPT` and `buildJudgeMessages()`. Kept in a
reviewable file so the prompt is diffable and explicitly part of the public surface.

### Runner

- `runSuite(suite, { client, samplesOverride? })` — orchestrates: loops cases, runs samples,
  applies scorers, aggregates across samples, computes the run summary. Sample-level failures
  and scorer-thrown errors are recorded as zero-score scores; they never crash the run.

### Artifact

- `RunArtifactSchema` — zod schema for the on-disk artifact.
- `toArtifact(run)` — convert a `RunResult` to its plain-JSON `RunArtifact` form.
- `artifactPath({ outputDir, suite, promptVersion, startedAt })` — sortable filename:
  `<YYYYMMDDTHHMMSS>-<suite-slug>-<version-slug>.json`.
- `writeArtifact(artifact, path)` — write the JSON to disk (creates the parent dir).
- `persistArtifact(run, outputDir)` — convenience: build + place + write in one call.

## Artifact schema (v1)

Every run produces a single JSON file in `runs/` (overridable via `--output`). Schema:

```ts
{
  schemaVersion: 1,
  runId:        string (uuid),
  suite:        string,
  promptVersion: string,
  model:        string,            // pinned snapshot ID
  startedAt:    ISO 8601 string,
  finishedAt:   ISO 8601 string,
  cases: [
    {
      caseId:   string,
      passed:   boolean,
      aggregateScores: [{ scorer, value, passed, reason?, detail? }],
      samples: [
        {
          output:        string,
          scores:        [{ scorer, value, passed, reason?, detail? }],
          inputTokens:   number,
          outputTokens:  number,
          costUSD:       number,
          latencyMs:     number,
          cacheHit:      boolean,
          stopReason:    string | null,
        },
      ],
    },
  ],
  summary: {
    totalCases, passedCases, passRate,
    totalCostUSD, totalInputTokens, totalOutputTokens,
    latencyMsP50, latencyMsP95,    // exclude cache hits
    cacheHitRate,
  }
}
```

Artifacts are **immutable** (ADR-0008). A rerun produces a new file; the SQLite history
(Phase 2) is rebuildable from these artifacts and is just an index over them.

### History DB

`HistoryDb` wraps `better-sqlite3` with prepared statements and a transactional
`insertRun`. Schema is idempotent at open (`CREATE TABLE IF NOT EXISTS`); the DB is a
rebuildable index over the JSON artifacts on disk.

Tables: `runs` (one per run, summary denormalized), `cases` (one per `run × case` with
input/expectation/aggregate scores), `samples` (one per `run × case × sample` with output +
cost + latency), `judge_verdicts` (one per llmJudge invocation, for verdict-axis queries).

API: `insertRun(artifact, path?)`, `listRuns({ suite?, limit? })`, `getRunSummary(runId)`,
`getCases(runId)`, `resolveRunIdPrefix(prefix)`, `countRuns()`, `deleteRun(runId)`,
`close()`.

### Diff

`diffCases(a, b)` returns `CaseDiff[]` with kinds `regressed | fixed | still-passing |
still-failing | new | removed`. Pure function; format-free so the CLI, dashboard, and
CI gate consume the same shape.

### Logger

- `getLogger()` / `childLogger(fields)` — pino-backed structured logger. No `console.log` in
  library code (CLAUDE.md golden rule).

# @yardstick/cli

The `yardstick` command. Loads suites from `.ts`/`.js` files via tsx, runs them through
the core runner, persists results to JSON + SQLite, and (the headline feature) gates CI
on regressions.

## Subcommands

```
yardstick run <suite> [--no-cache] [-o <dir>] [-n <samples>] [-v]
yardstick history [-s <suite>] [-n <limit>]
yardstick diff <runA> <runB>
yardstick rebuild-db [--runs <dir>]
yardstick ci [--config <path>] [-o <dir>] [--no-cache] [-v]
```

- `run` — execute a single suite, write artifact + SQLite, print colored summary, exit 0
  if every case passed (else 1).
- `history` — last N runs from the DB. `-s` filters by suite.
- `diff <runA> <runB>` — case-level diff between two runs by id prefix (≥ 4 chars).
  Exits 1 if any case regressed, so it's usable from a script.
- `rebuild-db` — scan `runs/` and reinsert every artifact. Idempotent; auto-migrates v1
  artifacts to the current schema.
- `ci` — the regression gate. See below.

## The eval gate (`yardstick ci`)

Runs every suite listed in `yardstick.config.json` against the configured model, applies
the per-suite `thresholds` block, writes a Markdown summary to `$GITHUB_STEP_SUMMARY`
when present, and exits **non-zero on any gate failure**. Drop the workflow file in
`.github/workflows/eval-gate.yml` and CI fails red on every PR that trips a threshold.

### Configuration

```json
// yardstick.config.json
{
  "ciSuites": ["suites/extraction.ts", "suites/classification.ts"]
}
```

Suites listed here run on every CI invocation, in order. The `generation` suite is
deliberately omitted by default — judge calls add cost + variance per PR, and the
suite is more valuable as a local-run diagnostic than a gate.

### Thresholds (per-suite)

Set on the suite's `thresholds` field. All are optional — missing axes don't gate.

| Axis | Meaning | When to set | Tuning advice |
|---|---|---|---|
| `passRate` | Fraction of cases that passed must be `>=` this | Always. Headline signal. | Start at observed pass rate − 5%. A flaky 100%-passing suite should be gated at 0.85, not 0.95, to absorb noise. |
| `passAtK` | A case passes if `>= k` of its N samples passed | Only when `case.samples > 1`. Default: 1 (lenient — any sample passes). | Use 1 for "the model can do it sometimes." Use N for "the model does it reliably." Anything in between is rarely worth the cognitive load. |
| `maxCostUSD` | Total run cost must be `<=` this | When prompt changes might balloon tokens | Set at 2-3× observed cost so legitimate variance doesn't trip it. |
| `maxLatencyMsP95` | p95 model latency must be `<=` this (excludes cache hits) | When latency budget matters | Set generously; Anthropic latency varies hour to hour. |

### Example workflow output

```
Yardstick — extraction (v1) — claude-haiku-4-5
──────────────────────────────────────────────
  ✓ addr-simple
  ✓ addr-apt
  ...

Pass rate: 8/8 (100.0%)
Cost:      $0.004500  ·  in 1,756 tok · out 553 tok
Latency:   p50 412ms  ·  p95 891ms
Cache:     100% hit
Artifact:  /runs/20260605T...

GATE: ✓ passed

────────────────────────────────────────────────────────────
eval-gate: ✓ all 2 suite(s) passed
```

On failure, every violated threshold is listed (the gate reports all reasons, not just
the first) plus a `<details>`-collapsed list of failing cases in the GitHub PR summary.

## Dev loop

`pnpm yardstick <cmd>` runs the CLI from source via tsx — no `pnpm build` needed during
development. The published `bin` script (`packages/cli/bin/yardstick.mjs`) consumes
compiled `dist/` for production installs.

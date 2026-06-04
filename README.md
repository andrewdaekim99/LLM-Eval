# Yardstick

Claude-native LLM **evaluation & observability harness**: a TypeScript library + CLI for
defining eval suites, scoring outputs with a mix of deterministic + LLM-as-judge scorers,
caching every model call, and (in later phases) gating CI on regressions.

> **Status:** Phase 1 — runnable core. The CLI scores extraction suites end-to-end.
> Judge + history (Phase 2), CI gate (Phase 3), and dashboard (Phase 4) ship next.
> See [`ROADMAP.md`](./ROADMAP.md) and [`PROJECT_DIRECTION.md`](./PROJECT_DIRECTION.md).

## Quickstart

```bash
pnpm install
cp .env.example .env             # drop your ANTHROPIC_API_KEY into .env
pnpm yardstick run suites/extraction.ts
```

You'll see a per-case pass/fail summary plus pass rate, cost, latency p50/p95, and the
written artifact path. Re-runs are free — responses are cached on disk under
`./.cache/responses` keyed by `(model, prompt, input, params)`.

```
Yardstick — extraction (v1) — claude-haiku-4-5
──────────────────────────────────────
  ✓ addr-simple
  ✓ addr-apt
  ✗ addr-rural  (fieldAccuracy: 2/4 fields matched; missed: state, zip)
  ...

Pass rate: 7/8 (87.5%)
Cost:      $0.0042  ·  in 1,250 tok  ·  out 980 tok
Latency:   p50 412ms  ·  p95 891ms
Cache:     0% hit
Artifact:  runs/20260604T164822-extraction-v1.json
```

## Repo layout

- `packages/core` — types, runner, scorers, cached Anthropic client, pricing, artifact writer
- `packages/cli` — `yardstick` command (`run`, `report` [Phase 2], `ci` [Phase 3])
- `apps/dashboard` — Next.js dashboard (Phase 4)
- `suites/` — example eval suites (`extraction.ts` is the first)
- `.github/workflows/` — eval-gate Action (Phase 3)

## Why these reliability decisions

See [`DECISIONS.md`](./DECISIONS.md) for 15 ADRs covering pinned model IDs, cached client,
LLM-judge-as-fallible (rubric + bias mitigation), immutable runs, aggregate-only gating,
zod at boundaries, and the deliberate Claude-only scope.

## Local development

```bash
pnpm test         # offline (no live API calls), 73+ tests
pnpm typecheck    # tsc -b + dashboard
pnpm lint         # eslint with type-aware async-safety rules
pnpm format       # prettier --write
pnpm check        # everything above
```

Tests use a fake `ModelClient` and never hit the API (ADR-0011). The CLI uses `tsx` and the
`development` export condition so workspace sources are loaded directly — no build step
needed for the dev loop.

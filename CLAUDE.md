# CLAUDE.md

Operational guide for working in this repo. For the **vision, scope, and roadmap**, read
[`PROJECT_DIRECTION.md`](./PROJECT_DIRECTION.md) — that is the source of truth for *what* and
*why*. This file covers *how to work here*.

---

## Project in one paragraph

**Yardstick** is a Claude-native LLM **evaluation & observability harness** — a TypeScript
library (`@yardstick/core`) + CLI, plus a Next.js dashboard. You define eval suites (cases
with inputs, a pinned prompt + model, and scorers), run them against Claude, and score outputs
with a mix of deterministic scorers (`exactMatch`, `jsonSchema`, `fieldAccuracy`) and an
`llmJudge`. Every run is captured with cost/latency/token metrics, persisted as a portable
JSON artifact + SQLite history, and diffable across prompt versions. A GitHub Action runs the
suites on every PR and **fails the build on a quality/cost regression** — the headline feature.
Goal: a portfolio centerpiece proving real production-AI judgment, full-stack ability, and the
hard skill of testing a nondeterministic system. Companion project to the integration engine.

---

## Golden rules (do not violate without asking)

1. **Pinned model IDs only**, never convenience aliases — reproducibility depends on it.
   Defaults: system-under-test `claude-haiku-4-5`, judge `claude-sonnet-4-6`
   (`claude-opus-4-8` for the hardest rubrics).
2. **All model calls go through the cached client wrapper.** No raw SDK calls scattered
   around the codebase. Cache key = (model, prompt, input) so reruns are free + deterministic.
3. **Scorers are pure** functions of `(output, expectation) -> Score`. No hidden side effects.
   The only scorer allowed to hit the network is `llmJudge`, and it goes through the same
   cached client wrapper as everything else.
4. **Treat the judge as fallible.** `llmJudge` always uses a written rubric + structured (JSON)
   output with a reason, plus bias mitigation (randomize position, avoid self-preference,
   optional N-sample averaging). Never a bare "is this good? yes/no".
5. **Runs are immutable.** Never mutate a past run record; a re-run produces a *new* run keyed
   by suite + prompt version + model ID.
6. **Gate on aggregates, never a single generation.** Pass/fail in CI is based on pass-rate or
   pass@k across samples with variance in mind — one unlucky completion must not flip the build.
7. **`ANTHROPIC_API_KEY` is server-side only.** Never ship it to the dashboard/client bundle.
8. **Be cost-aware by default.** Cheap default model + caching. **Tests never make live API
   calls** — they use a fake client + cached fixtures.

---

## Commands (targets — this is greenfield; Phase 0 creates them)

- `pnpm i` — install (pnpm workspaces monorepo).
- `pnpm dev` — run the dashboard locally.
- `pnpm yardstick run <suite>` — run an eval suite, write artifact + history.
- `pnpm yardstick report` — print a run summary / diff vs a previous run.
- `pnpm test` — unit tests (no live API calls).
- `pnpm lint` / `pnpm typecheck` — must pass before any slice is done.
- `docker-compose up` — dashboard + storage for a local demo.

---

## Repo structure (pnpm monorepo)

```
packages/
  core/         # types, runner, scorers, cached Anthropic client wrapper, pricing table
  cli/          # `yardstick` command (run, report, ci)
apps/
  dashboard/    # Next.js + Tailwind + Recharts; reads SQLite/JSON artifacts
suites/         # the example eval suites (extraction, classification, generation, ...)
.github/workflows/  # the eval-gate GitHub Action
```

The library/runner/scorer interfaces are **provider-agnostic by design** even though only the
Claude adapter is implemented. Keep that seam clean — it's a deliberate, interview-worthy choice.

---

## Environment & secrets

- All config from env vars, validated with **zod at startup** (fail fast on missing vars).
- **Never commit secrets.** `.env` is gitignored; `.env.example` lists every variable with a
  placeholder and a one-line comment.
- Expected vars: `ANTHROPIC_API_KEY`, `YARDSTICK_MODEL` (default sut), `YARDSTICK_JUDGE_MODEL`,
  `DATABASE_URL` (SQLite path), `CACHE_DIR`.
- The API key stays server-side only — never bundle it into the dashboard/client.

---

## Coding conventions

- TypeScript `strict`; explicit types at module boundaries. Avoid `any`; use `unknown` + a zod
  parse instead.
- Validate every external input (suite configs, judge JSON output, env) with zod before use.
- Errors: throw typed errors; distinguish **retryable** (network/5xx, rate limit) from
  **terminal** (bad config/validation) so the runner can back off vs. fail fast.
- No `console.log` in library code — use a structured logger with fields (run id, suite, case id).
- Keep functions small and pure; side effects (network, DB, fs) live at the edges.
- Name by domain concept: `Suite`, `Case`, `Scorer`, `Score`, `RunResult`, `JudgeVerdict`.

---

## Testing expectations

- **No live API calls in tests.** Use a fake Anthropic client + cached fixtures.
- The scoring core is non-negotiable to test: each deterministic scorer, and the `llmJudge`
  parsing + **bias-mitigation** logic (with the judge faked to return known verdicts).
- Test the cache layer (hit/miss, key stability) and the regression-gate logic (threshold +
  pass@k aggregation) — those are the project's "moat", so coverage concentrates there.

---

## Git & workflow

- Small, reviewable commits aligned to the phases in `PROJECT_DIRECTION.md` (§7).
- Conventional commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`).
- One PR per phase (or coherent slice); each PR leaves the project runnable + demoable.
- Log notable design decisions in `DECISIONS.md` (what, why, alternatives) — these become your
  "tell me about a tradeoff" interview answers.

---

## Definition of done (per slice)

- Runs via `pnpm dev` / `docker-compose up` with no setup beyond `.env`.
- Tests for any scoring or gating logic touched; **no live calls** in CI.
- `pnpm lint`, `pnpm typecheck`, and `pnpm test` all pass.
- README / `.env.example` / this file updated if commands or behavior changed.

---

## Out of scope for the core build

Multi-provider adapters, auth/multi-tenancy/billing, a hosted SaaS, and third-party
**embeddings APIs** are **out of scope** (see `PROJECT_DIRECTION.md` §5 and §11). For fuzzy
similarity, prefer `llmJudge`; only reach for a *local* embedding model if needed. Do not pull
any of these into the core unless explicitly asked. Local + the CI gate are the daily drivers;
dashboard deploy is an optional, lightweight stretch.

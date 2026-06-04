# ROADMAP.md — Yardstick

A step-by-step plan for building Yardstick to "demoable on a portfolio" quality. Phases
follow `PROJECT_DIRECTION.md` §7 and are sized to be **one PR per phase**, each leaving the
project runnable and demoable.

Each phase has two checklists:
- **[ ] Claude tasks** — things I (Claude Code) can do directly in this repo.
- **[ ] Your tasks** — things only you can do (provision keys, set GitHub secrets, eyeball UI,
  approve real-money operations, take screenshots).

When checking off a Claude task, also link the PR / commit in the line where useful. When
checking off a Your task, leave a one-word receipt (`done`, `skipped`, `deferred`) so we
both know where we stand.

The roadmap is itself a working document — when reality diverges from the plan, edit the
plan, don't pretend it didn't.

---

## Phase 0 — Scaffold (the foundation)

**Goal:** A monorepo skeleton that builds, lints, type-checks, and tests cleanly, with
config validation, secrets handling, and a working Anthropic client wrapper. No evals run
yet; the pipes are in place.

**Definition of done:** `pnpm install && pnpm typecheck && pnpm lint && pnpm test` all pass
on a fresh clone. `.env.example` lists every variable. `git log` shows clean conventional
commits.

### Claude tasks
- [x] Initialize `pnpm-workspace.yaml` covering `packages/*` and `apps/*`.
- [x] Root `package.json` with shared dev deps (typescript, vitest, eslint, prettier, tsx).
- [x] Root `tsconfig.base.json` (strict, ES2022, NodeNext) + per-package `tsconfig.json`
      with project references.
- [x] ESLint + Prettier config with `typescript-eslint` **type-checked** preset enabled
      (key rules: `no-floating-promises`, `no-misused-promises`, `await-thenable`). See
      ADR-0015 in `DECISIONS.md`.
- [x] Vitest config at repo root, set up for workspace-aware testing.
- [x] Create `packages/core/` skeleton: `src/index.ts`, `src/types.ts`, `package.json`,
      `tsconfig.json`, `README.md` stub.
- [x] Create `packages/cli/` skeleton: `src/index.ts` (commander or clipanion), `bin/yardstick`,
      `package.json`.
- [x] Create `apps/dashboard/` skeleton: `next.config.mjs`, `app/page.tsx`, Tailwind config,
      `package.json`. Placeholder "hello yardstick" page only.
- [x] Create `suites/` directory with a `README.md` describing the format.
- [x] Add `.env.example` listing: `ANTHROPIC_API_KEY`, `YARDSTICK_MODEL`,
      `YARDSTICK_JUDGE_MODEL`, `DATABASE_URL`, `CACHE_DIR`, `LOG_LEVEL`.
- [x] Implement `packages/core/src/config.ts` — zod-validated env loader with fail-fast.
- [x] Implement `packages/core/src/types.ts` — `Suite`, `Case`, `Scorer`, `Score`, `RunResult`,
      `JudgeVerdict` interfaces, all explicit.
- [x] Implement `packages/core/src/client.ts` — the cached Anthropic client wrapper. Cache
      key = `(model, prompt, input, params)`. Disk cache under `CACHE_DIR`. Pluggable
      transport so tests can inject a fake.
- [x] Implement `packages/core/src/pricing.ts` — pricing table for the three pinned models;
      `costOf({ inputTokens, outputTokens, model })`.
- [x] Implement `packages/core/src/logger.ts` — structured logger (pino) with run-id /
      suite-id / case-id fields.
- [x] Add `.gitignore` (covers `.env`, `node_modules`, `dist`, `.cache`, `*.db`, `coverage`).
- [x] Add `.editorconfig`.
- [x] Add a `scripts/check.sh` that runs lint + typecheck + test in one command.
- [x] Write tests for `config.ts` (missing var fails fast; alias model ID rejected).
- [x] Write tests for `client.ts` cache layer (hit/miss; key stability; fake transport).
- [x] Write tests for `pricing.ts`.
- [x] Write a minimal CLI `yardstick --version` and `yardstick --help` that work end-to-end.
- [x] Update `CLAUDE.md` commands section if anything diverged from the targets listed there.
      *(Targets match: `pnpm i`, `pnpm dev`, `pnpm test`, `pnpm lint`, `pnpm typecheck`, and
      `pnpm yardstick run <suite>` all wired; `docker-compose up` ships in Phase 4.)*
- [x] Commit each logical chunk as a conventional commit (`chore:`, `feat:`, etc.).

### Your tasks
- [x] Install Node.js 20+ and pnpm 9+ locally if not already installed.
      *(Verified: Node v22.22.2, pnpm 9.15.0.)*
- [x] `git init` the repo (or tell me to do it). *(done by Claude on `main`.)*
- [x] Create the GitHub repo and add `git remote add origin ...`.
      *(github.com/andrewdaekim99/LLM-Eval)*
- [x] Add your `ANTHROPIC_API_KEY` to a local `.env` (never commit).
- [x] Run `pnpm install && pnpm test` on a fresh clone to confirm bootstrap works.
      *(Smoke-tested via `git clone` into a temp dir → `pnpm install` (2.3s) → `pnpm check`:
      typecheck, lint, 25 tests, format check all green. Temp dir cleaned up.)*
- [x] Push the first commit so future PRs have a base branch.
      *(`main` pushed and tracking `origin/main`.)*

---

## Phase 1 — Runnable core (`yardstick run <suite>` works)

**Goal:** End-to-end pipeline for deterministic scorers: load a suite, call Claude (cached),
score, write a JSON artifact. One real example suite (structured extraction) ships with it.

**Definition of done:** `pnpm yardstick run suites/extraction.ts` runs end-to-end against the
real API once, then is free on reruns. A JSON artifact lands in `runs/`. Every scorer has
tests. The artifact format is documented.

### Claude tasks
- [x] Implement `packages/core/src/runner.ts` — orchestrates: load suite → for each case,
      call client → run scorers → assemble `RunResult`. Captures latency, tokens, cost,
      cache-hit flag, model ID, prompt version hash.
- [x] Define `RunArtifact` JSON schema (zod), write it to `runs/<timestamp>-<suite>-<hash>.json`.
- [x] Implement scorer: `exactMatch(output, expected)`.
- [x] Implement scorer: `regex(output, pattern)`.
- [x] Implement scorer: `contains(output, needle)`.
- [x] Implement scorer: `jsonSchema(output, schema)` — validates output is parseable JSON
      conforming to a zod schema.
- [x] Implement scorer: `fieldAccuracy(output, expectedObject)` — per-field equality with
      partial-credit aggregation.
- [x] Wire up the `yardstick run <suite>` command in `packages/cli/`. Flags: `--no-cache`,
      `--output <dir>`, `--verbose`. *(Also added `-n / --samples` for pass@k preview.)*
- [x] Build `suites/extraction.ts` — 8-12 cases extracting structured fields from messy free
      text (shipping addresses, order lines). Use `jsonSchema` + `fieldAccuracy`.
      *(Shipped with 8 address cases.)*
- [x] Pretty-print a one-screen summary on stdout after a run (pass-rate, cost, latency p50/p95).
- [x] Write unit tests for every scorer (positive, negative, edge cases like empty strings,
      non-string outputs, malformed JSON). *(35 scorer tests.)*
- [x] Write a runner test using the fake client to assert: cases iterate, scorers run, artifact
      written, errors per-case don't kill the whole run. *(8 runner tests + 4 artifact tests.)*
- [x] Document the artifact schema in `packages/core/README.md`.
- [x] Add a top-level `README.md` with a 20-line quickstart pointing at this phase's command.
- [x] Commit phase as `feat(core): runnable core with deterministic scorers`.

### Your tasks
- [ ] Run `pnpm yardstick run suites/extraction.ts` against the real API once and confirm
      the cost is reasonable (should be cents).
- [ ] Skim the JSON artifact and sanity-check the shape — flag anything that feels awkward to
      query before we add SQLite on top of it next phase.
- [ ] Open the resulting `runs/*.json` in the editor; tell me if the field ordering or
      nesting bugs you (now's the cheap time to change it).
- [ ] Review the extraction suite's example cases — are they representative enough? If you
      want different domain examples (e.g., from real Patchbay data), point me at them.

---

## Phase 2 — Judge + observability (the moat)

**Goal:** `llmJudge` works with rubric + bias mitigation. Every run lands in SQLite. Cost,
latency, tokens are tracked over time. Two runs can be diffed.

**Definition of done:** A second example suite (open-ended generation) scored by `llmJudge`
runs and stores results. `yardstick history` lists past runs from SQLite. Bias-mitigation
logic has its own tests.

### Claude tasks
- [ ] Add `better-sqlite3` to `packages/core`.
- [ ] Implement `packages/core/src/db.ts` — schema (`runs`, `cases`, `scores`, `judge_verdicts`),
      idempotent migrations, prepared statements, sync API.
- [ ] Implement persister: after the runner produces an artifact, also insert into SQLite.
      SQLite is rebuildable from artifacts (write a `yardstick rebuild-db` command).
- [ ] Implement `llmJudge` scorer:
  - Takes `{ rubric, judgeModel?, samples? }`.
  - Builds the judge prompt deterministically.
  - Calls the cached client; parses structured JSON with zod.
  - Stores `JudgeVerdict { score, verdict, reason, rubric, model, samples[] }`.
- [ ] Implement bias mitigation:
  - Position randomization for A/B comparisons.
  - N-sample averaging when `samples > 1`, returning mean + variance.
  - Optional "use a different judge family" guard for self-preference.
- [ ] Build `suites/generation.ts` — 6-10 open-ended cases (summarize/QA) with a rubric per case.
- [ ] Implement `yardstick history` command — last N runs, sortable by date / suite / pass-rate.
- [ ] Implement `yardstick diff <run-a> <run-b>` — per-case score delta, cost delta,
      latency delta, new failures, fixed failures.
- [ ] Write tests for `llmJudge` parsing (well-formed verdict, malformed JSON, missing fields).
- [ ] Write tests for bias-mitigation logic with a fake judge that returns scripted verdicts.
- [ ] Write tests for the SQLite layer (insert, query, rebuild from artifacts).
- [ ] Write tests for the diff logic.
- [ ] Add a small "judge prompt template" file under `packages/core/src/judge/` so it's
      reviewable and version-controllable.
- [ ] Commit phase as `feat(core): llmJudge, sqlite history, run diff`.

### Your tasks
- [ ] Eyeball the generation suite outputs — do the judge verdicts feel calibrated? If the
      judge is too lenient/strict on a case, the rubric needs tuning (this is the kind of
      thing only you can decide).
- [ ] Decide whether `samples` should default to 1 (cheap) or 3 (more reliable). I'll default
      to 1; tell me to change it if you want more.
- [ ] Run two suites back-to-back, tweak a prompt in between, and confirm `yardstick diff`
      tells a story you'd want to put on a portfolio screenshot.

---

## Phase 3 — CI gate (the headline feature)

**Goal:** A GitHub Action runs the suites on every PR, computes pass-rate / pass@k against
configured thresholds, and **fails the build on regression**. A deliberately bad prompt
proves the gate works.

**Definition of done:** A PR with a "bad" prompt change has a red check, and the failure
output makes the regression obvious. Threshold config is repo-checked and reviewable.

### Claude tasks
- [ ] Add suite-level threshold config: `{ passRate, passAtK, maxCostUSD, maxLatencyMsP95 }`.
- [ ] Implement `packages/core/src/gate.ts` — aggregates per-case results, applies thresholds,
      returns `{ passed, reasons[] }`.
- [ ] Implement `yardstick ci` command — runs configured suites, applies gate, exits non-zero
      on failure, writes a Markdown summary to `$GITHUB_STEP_SUMMARY` when available.
- [ ] Implement pass@k aggregation (N samples per case, k=1 default).
- [ ] Implement variance reporting (std dev across samples) in the run summary.
- [ ] Build `suites/classification.ts` — labeling task with `exactMatch`, plus a confusion
      matrix in the report.
- [ ] Write `.github/workflows/eval-gate.yml`:
  - On PR + push to main.
  - Caches `~/.cache/yardstick` between runs (so reruns are free).
  - Posts the Markdown summary on the PR via `actions/github-script` or job summary.
  - Uploads the run artifact as a workflow artifact.
- [ ] Write tests for `gate.ts` (every threshold permutation, edge cases like 0 cases, all
      pass, all fail, partial fail).
- [ ] Write tests for pass@k aggregation.
- [ ] Document the gate config + threshold tuning advice in `packages/cli/README.md`.
- [ ] Commit phase as `feat: ci eval-gate with pass@k`.

### Your tasks
- [ ] Add `ANTHROPIC_API_KEY` to GitHub repo secrets (Settings → Secrets and variables →
      Actions). I cannot do this for you.
- [ ] Decide which suites the CI gate should run on every PR (probably extraction +
      classification; generation is slower/more expensive). Tell me and I'll wire it.
- [ ] Pick the initial thresholds. I'll suggest sane defaults from the first real run, but
      the final numbers are a judgment call you should own.
- [ ] Cut a deliberate "regression PR" with a clearly-worse prompt; confirm CI fails red and
      the message is obvious. Screenshot the failing check for the README.
- [ ] (Optional) Configure branch protection requiring the eval-gate check to pass before
      merge.

---

## Phase 4 — Dashboard (the demoable surface)

**Goal:** A polished Next.js dashboard that turns the SQLite/JSON artifacts into a run list,
trend charts, prompt-version diffs, and a failure drill-down. Read-only; the dashboard never
calls the API.

**Definition of done:** `pnpm dev` opens a dashboard at localhost:3000 with real data from
runs. Every screen has at least one test and looks acceptable in screenshots. No
`NEXT_PUBLIC_*` reference to the API key anywhere.

### Claude tasks
- [ ] Stand up the Next.js app properly: app router, Tailwind, shadcn/ui (or comparable).
- [ ] Implement server-side data layer: read SQLite + JSON artifacts via `@yardstick/core`.
- [ ] Build **Run list** view — table of runs with suite, date, pass-rate, cost, latency,
      links to detail.
- [ ] Build **Run detail** view — per-case results, output vs expected, judge verdicts with
      reasons, cache-hit indicators.
- [ ] Build **Suite trend** view — pass-rate / cost / latency over time using Recharts.
- [ ] Build **Diff** view — side-by-side compare of two runs: regressed cases, fixed cases,
      cost delta, latency delta.
- [ ] Build **Failure drill-down** — for a regressed case, show prompt, input, expected,
      actual, judge reason, and what changed vs the prior passing run.
- [ ] Add a top-nav with suite filter + date range filter.
- [ ] Use shadcn `Card`, `Table`, `Badge` etc. for a clean default look — no custom CSS unless
      necessary.
- [ ] Write component tests (or playwright) for: run list renders, diff highlights
      regressions, drill-down shows judge reason.
- [ ] Confirm no client component imports `process.env.ANTHROPIC_API_KEY` or any
      `NEXT_PUBLIC_` proxy of it.
- [ ] Add a `docker-compose.yml` for `dashboard` + a shared volume mount of the runs dir.
- [ ] Commit phase as `feat(dashboard): run list, trends, diff, drill-down`.

### Your tasks
- [ ] Open the dashboard in a browser and walk every screen. UI feel is hard to test
      automatically; tell me what looks off.
- [ ] Decide on a visual identity (color, logo, typography). I'll use neutral defaults; you
      can swap them.
- [ ] Take dashboard screenshots for the top-level README — at least the trend view and the
      diff view.
- [ ] (Optional) Decide whether to deploy the dashboard to Vercel for a live link. If yes,
      give me the green light and a project name; if no, we ship it as `docker-compose up`
      only.

---

## Phase 5 — Fill out & ship (the portfolio polish)

**Goal:** Everything an interviewer or recruiter would look at is in place: README hero,
architecture diagram, the deliberate failing-PR demo link, optional extra suite, and a
one-command setup. The repo is presentable, the story is tight.

**Definition of done:** A first-time visitor lands on the README and can: (a) understand the
project in 30 seconds, (b) clone and run it in one command, (c) see a screenshot of the
dashboard, (d) click through to a real failing CI run.

### Claude tasks
- [ ] Rewrite the root `README.md`:
  - Hero paragraph + dashboard screenshot.
  - 5-bullet "what it does."
  - 3-bullet "why it's different" (reproducibility, judge-as-fallible, CI gate).
  - Quickstart (`pnpm i && pnpm yardstick run suites/extraction.ts`).
  - Link to the failing CI run from Phase 3.
  - Architecture diagram (Mermaid or a checked-in PNG; I'll start with Mermaid).
  - Link to companion project Patchbay.
- [ ] Build `suites/robustness.ts` (optional fourth suite) — does the model stay in JSON,
      refuse out-of-scope asks, respect length limits.
- [ ] Add a "why these reliability decisions" section to the README, pointing at DECISIONS.md.
- [ ] Polish the `--help` output of the CLI.
- [ ] Add example output (cast or animated GIF source) for `yardstick run` in `docs/`.
- [ ] Confirm every golden rule in CLAUDE.md is reflected somewhere in code or tests.
- [ ] Run a full `pnpm check` and fix any drift.
- [ ] Final pass on `DECISIONS.md` — add any ADRs for choices that emerged during
      implementation that weren't in PROJECT_DIRECTION.md.
- [ ] Commit phase as `docs: ship-ready readme, robustness suite, polish`.

### Your tasks
- [ ] Pick the final project name (Yardstick or alternative). I'll find/replace once.
- [ ] Record a 30-second GIF of `yardstick run` for the README (asciinema → gif, or
      Quicktime → gif). Only you can decide what looks good here.
- [ ] Write a one-paragraph LinkedIn / portfolio blurb pointing at the repo (your voice, not
      mine).
- [ ] (Optional) Deploy the dashboard to a public URL and link it from the README.
- [ ] (Optional) Add a one-sentence cross-link in Patchbay's README pointing at Yardstick
      (and vice versa). Makes the two projects feel like a body of work.
- [ ] Push the deliberate "regression PR" to a public branch and pin the failing check link
      into the README.

---

## Cross-cutting checklists (not phase-bound)

These exist for the whole life of the project — don't wait for a phase to do them.

### Documentation hygiene
- [ ] When a command name, env var, or behavior changes, update `CLAUDE.md` in the same commit.
- [ ] When a non-obvious decision is made, append an ADR to `DECISIONS.md` in the same commit.
- [ ] When a phase ships, tick the boxes here in the same commit.

### Test discipline
- [ ] Zero live API calls in `pnpm test`.
- [ ] Every scorer change ships with a test (positive + negative).
- [ ] Every `gate.ts` change ships with a test (the moat).

### Cost discipline
- [ ] Default model stays `claude-haiku-4-5` for system-under-test.
- [ ] Cache stays on by default in CI.
- [ ] Sample counts > 1 stay opt-in per case.

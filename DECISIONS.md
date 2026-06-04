# DECISIONS.md — Yardstick

Notable design decisions for the project. Each entry captures **what** was chosen, **why**,
and **what was considered and rejected**. These exist for two reasons: (1) so future-me (and
collaborators) can understand the reasoning behind non-obvious choices, and (2) so they
double as interview answers when asked "tell me about a tradeoff you made."

Format: append new entries at the bottom. Never edit a past entry — supersede it with a new
one that links back.

---

## ADR-0001 — Claude-only provider, with provider-agnostic interfaces

**Date:** 2026-06-04
**Status:** Accepted (locked in `PROJECT_DIRECTION.md` §2)

### Context
Eval harnesses can be multi-provider (OpenAI, Anthropic, Google, Mistral, local models) or
single-provider. Multi-provider broadens appeal but explodes scope: per-provider auth,
quirks, token counting, pricing, error semantics, and a much larger test matrix.

### Decision
Implement a **Claude-only** adapter. Keep `Scorer`, `Runner`, and `ModelClient` interfaces
provider-agnostic so "add OpenAI" is a one-adapter change — but do not write that adapter.

### Alternatives considered
- **Multi-provider from day one** — rejected: scope blowup, dilutes the "Claude-native"
  positioning, and turns the project into a thin LangChain clone instead of a focused tool.
- **Hardcode Anthropic SDK calls throughout** — rejected: kills the interview talking point
  ("how would you extend to multiple providers?") and makes the cache wrapper messier.

### Consequences
- Cleaner scope; tighter feature set; honest narrative about deliberate constraints.
- The seam between `core/client.ts` and the rest of `core` must stay clean — no Anthropic
  types leaking into `Scorer` or `RunResult`.
- "Why didn't you support OpenAI?" has a strong answer instead of an apologetic one.

---

## ADR-0002 — TypeScript monorepo with pnpm workspaces

**Date:** 2026-06-04
**Status:** Accepted

### Context
Need a place for a library (`core`), a CLI (`cli`), and a dashboard (`apps/dashboard`) that
all share types. Options: single package, multi-repo, or monorepo.

### Decision
**pnpm workspaces** monorepo with `packages/core`, `packages/cli`, `apps/dashboard`,
`suites/`. TypeScript everywhere, `strict` mode on.

### Alternatives considered
- **Turborepo / Nx** — overkill for three packages; the marginal value (caching, task graph)
  doesn't justify the config tax for a portfolio project.
- **Single package** — rejected: blurs the seam between the library product and its consumers
  (CLI, dashboard), and makes "import `@yardstick/core` from another repo" a harder demo.
- **Two repos (library + dashboard)** — rejected: forces version pinning and publish dance
  for what is fundamentally one product.

### Consequences
- One `pnpm install` sets everything up.
- `apps/dashboard` consumes `@yardstick/core` as a workspace dep — type changes propagate.
- TS project references keep build times sane.

---

## ADR-0003 — SQLite for history, portable JSON for artifacts

**Date:** 2026-06-04
**Status:** Accepted

### Context
Runs need to be (a) queryable for the dashboard (trends, diffs, filters), and (b) portable
enough to commit to a repo or attach to a PR comment.

### Decision
**Dual storage**: every run writes a portable JSON artifact (the canonical record) *and* an
entry in a local **SQLite** DB (the queryable index). The JSON artifact is the source of
truth; SQLite is rebuildable from artifacts.

### Alternatives considered
- **SQLite only** — rejected: artifacts are valuable on their own (CI uploads, gist sharing,
  git-diffable history of golden runs), and a single binary file is opaque.
- **JSON only** — rejected: the dashboard would scan thousands of files for trend charts; bad UX.
- **Postgres** — rejected: deploy weight without payoff for a single-user local tool.
  Also competes with the integration-engine's Postgres story — see PROJECT_DIRECTION.md §8.

### Consequences
- A user can delete the SQLite DB and rebuild it from `runs/*.json`.
- Schema changes need a small migrator (artifacts are stable; SQLite is derived).
- Picks `better-sqlite3` for sync, simple API (no Prisma overhead).

---

## ADR-0004 — All Claude calls go through a cached client wrapper

**Date:** 2026-06-04
**Status:** Accepted (golden rule #2 in CLAUDE.md)

### Context
Eval reruns are common (tweaking a scorer, debugging the dashboard, demoing). If every rerun
hit the API, demos would be slow and expensive, and runs wouldn't be reproducible.

### Decision
A single `ModelClient` wraps the Anthropic SDK. **Cache key = (model ID, full prompt, input,
generation params)**. Cache lives on disk under `CACHE_DIR`. The wrapper is the only place
in the codebase that touches `@anthropic-ai/sdk` — including `llmJudge`.

### Alternatives considered
- **No cache, rely on `temperature=0`** — rejected: temperature=0 is not fully deterministic
  on Claude, and an API outage still breaks demos.
- **In-memory cache only** — rejected: doesn't survive process restarts; CI reruns pay again.
- **Cache by hash of `(prompt, input)` only** — rejected: a model version bump must invalidate;
  including the model ID in the key makes this automatic.

### Consequences
- Tests use the same wrapper with a fake transport — no SDK mocking in test files.
- A `--no-cache` flag exists for the case where you want a true fresh call.
- Cache hits are reported in run metadata so you can tell what was real vs. replayed.

---

## ADR-0005 — Pinned model snapshots only, never aliases

**Date:** 2026-06-04
**Status:** Accepted (golden rule #1)

### Context
Anthropic publishes both convenience aliases (e.g., `claude-sonnet-latest`) and pinned
snapshot IDs (e.g., `claude-sonnet-4-6`). Aliases silently shift when Anthropic releases
a new version.

### Decision
Use **pinned IDs only**, everywhere. Defaults: system-under-test = `claude-haiku-4-5`;
judge = `claude-sonnet-4-6`; opt-in `claude-opus-4-8` for hard rubrics. Reject alias-shaped
strings at config-load time with a clear error.

### Alternatives considered
- **Allow aliases with a warning** — rejected: warnings get ignored; the whole reproducibility
  story falls over the first time an alias silently shifts.
- **Pin via env var only** — rejected: easy to forget; defaults need to be safe too.

### Consequences
- Past runs remain interpretable even after Anthropic deprecates a snapshot (cached responses
  still replay correctly).
- A model upgrade is a deliberate, visible change in a config or env var — exactly what you
  want to be able to point at in a diff.

---

## ADR-0006 — Pure scorers; the only network-touching scorer is `llmJudge`

**Date:** 2026-06-04
**Status:** Accepted (golden rule #3)

### Context
Scorers can grow tentacles: hitting external APIs for ground truth, mutating shared state,
caching results inconsistently. That kills testability and reasoning.

### Decision
Every scorer is a pure function `(output, expectation) -> Score`. `llmJudge` is the single
exception — it makes a Claude call, but **through the same cached client wrapper** as
everything else, so it's still deterministic from the test's point of view.

### Alternatives considered
- **Allow scorers to fetch arbitrary side data** — rejected: introduces flakiness, makes
  reruns nondeterministic, and complicates the cache key.
- **Run `llmJudge` outside the scorer pipeline** — rejected: it conceptually *is* a scorer;
  hiding it elsewhere breaks the uniform interface that makes the runner simple.

### Consequences
- Scorer tests are trivial pure-function tests.
- `llmJudge` tests use a fake client + fixture verdicts; bias-mitigation logic is testable
  in isolation.

---

## ADR-0007 — Treat the judge as fallible: rubric + structured output + bias mitigation

**Date:** 2026-06-04
**Status:** Accepted (golden rule #4)

### Context
LLM-as-judge is the workhorse for open-ended scoring, but it's itself a stochastic system
with known biases (position bias, self-preference, length bias). Naïvely asking "is this
good? yes/no" produces noisy, biased, ungrounded verdicts.

### Decision
Every `llmJudge` call requires:
1. A **written rubric** as part of the scorer config (not implicit in the prompt).
2. **Structured JSON output** with `{ verdict, score, reason }`, validated by zod.
3. **Bias mitigation**: randomize position when comparing A/B, prefer a different judge model
   family when feasible, and support **N-sample averaging** for high-stakes rubrics.

### Alternatives considered
- **Free-text judge ("is this good?")** — rejected: not parseable, not auditable, biased.
- **Numeric-only judge ("score 1–10")** — rejected: no reason captured, hard to debug
  failures, no signal for the dashboard's drill-down view.
- **Trust the judge with no mitigation** — rejected: defeats the project's whole premise of
  taking nondeterminism seriously.

### Consequences
- A judge "failure" stores the rubric, verdict, and reason — debuggable from the dashboard.
- N-sample averaging costs more tokens; left off by default, opt-in per case.
- Strong interview answer to "why does the judge need its own validation?"

---

## ADR-0008 — Runs are immutable; a rerun produces a new run

**Date:** 2026-06-04
**Status:** Accepted (golden rule #5)

### Context
Tempting to "edit" a past run when fixing a scorer bug or re-judging. That destroys the audit
trail and makes trend charts unreliable.

### Decision
Runs are append-only. A run is keyed by `(suite, prompt version, model ID, run timestamp,
nonce)`. Re-running the same suite produces a *new* run that references the prior one.

### Alternatives considered
- **Allow re-judge in place** — rejected: silently rewrites history; dashboard trends lie.
- **Soft-delete + version** — rejected: more machinery than needed for the same end state.

### Consequences
- The dashboard's "diff" view compares two specific run IDs, not "the latest version of run X."
- Storage grows linearly with runs — acceptable for a portfolio-scale tool with caching.

---

## ADR-0009 — Gate CI on aggregates (pass-rate / pass@k), never single samples

**Date:** 2026-06-04
**Status:** Accepted (golden rule #6)

### Context
A single unlucky generation must not flip the build. That's both a correctness issue
(false-positive failures) and a credibility issue (devs will start ignoring the gate).

### Decision
The CI gate operates on **aggregates** over a configurable N samples per case, computing
**pass-rate** and (where applicable) **pass@k**. The threshold is a property of the suite,
checked into the repo alongside it.

### Alternatives considered
- **Gate on first sample only** — rejected: flaky CI is worse than no CI gate.
- **Gate on average score** — rejected: hides bimodal failures (half perfect, half garbage
  averages to "fine").
- **No CI gate, just dashboards** — rejected: the gate *is* the headline feature.

### Consequences
- Suite configs declare both the threshold (e.g., 0.85 pass-rate) and the sample count.
- The gating logic gets a thick test suite — it's the moat.

---

## ADR-0010 — `ANTHROPIC_API_KEY` is server-side only; never bundled to the client

**Date:** 2026-06-04
**Status:** Accepted (golden rule #7)

### Context
The dashboard is a Next.js app. Without discipline, secrets leak into client bundles via
`NEXT_PUBLIC_*` env vars or careless imports.

### Decision
The API key is read only in (a) Node CLI processes and (b) Next.js **server-side** code
(route handlers, server components). It's never referenced under any `NEXT_PUBLIC_*` name,
and there's no "send a prompt from the dashboard" feature that would require it client-side.

### Alternatives considered
- **"Run prompts from the dashboard" UX** — rejected: requires either client-side key
  (insecure) or a server proxy that turns the dashboard into a chat app (scope creep).

### Consequences
- The dashboard is purely a *viewer* over persisted runs; new runs come from the CLI or CI.
- A simple lint rule / convention prevents key references in `app/` or `components/`.

---

## ADR-0011 — Tests never make live API calls; fake client + cached fixtures

**Date:** 2026-06-04
**Status:** Accepted (golden rule #8)

### Context
Tests against a real API are flaky, slow, expensive, and require network in CI.

### Decision
Tests inject a **fake `ModelClient`** that returns canned responses or replays from
checked-in fixtures. The cache layer is itself tested with the fake client.
`pnpm test` runs offline.

### Alternatives considered
- **VCR-style record-and-replay against the real API** — rejected: fixture drift, cost,
  requires a key in CI.
- **Only smoke-test live, unit-test offline** — rejected: a separate "live smoke" target is
  fine to *add later* but the default `pnpm test` must be offline.

### Consequences
- Coverage focuses on scorers, judge parsing, bias mitigation, cache logic, and gating —
  all of which are deterministic and worth testing.
- An optional `pnpm test:live` script can exist for hand-validation, gated behind a key check.

---

## ADR-0012 — Local embeddings only (if any); no third-party embeddings API

**Date:** 2026-06-04
**Status:** Accepted (PROJECT_DIRECTION.md §5, §11)

### Context
Fuzzy similarity scoring is a common eval need. The standard answer is OpenAI's embeddings
API or similar — but that breaks the "Claude-only" promise.

### Decision
Prefer `llmJudge` as the primary fuzzy scorer. If a similarity score is genuinely needed,
use a **local** embedding model (e.g., transformers.js running offline). Never call a
third-party embeddings API.

### Alternatives considered
- **Use OpenAI embeddings as "just infra, not a model provider"** — rejected: muddies the
  Claude-only narrative and adds a second vendor.
- **No fuzzy scoring at all** — rejected: too restrictive; the judge already covers most cases.

### Consequences
- Honest one-vendor story.
- Local embeddings may be slower / lower-quality than OpenAI's, but that's acceptable for a
  fallback scorer used sparingly.

---

## ADR-0013 — CI gate is the headline; no AWS deploy story

**Date:** 2026-06-04
**Status:** Accepted (PROJECT_DIRECTION.md §8)

### Context
The companion project (Patchbay) carries the AWS/Fargate/SQS/RDS narrative. Repeating it here
would dilute both projects' stories.

### Decision
The "ops" narrative for this project is **CI/CD + developer experience**:
GitHub Actions eval-gate (the most demoable artifact), local + `docker-compose` as the daily
driver, optional lightweight dashboard deploy (Vercel or single container). No AWS.

### Alternatives considered
- **Mirror the engine's AWS deploy** — rejected: redundant signal, dilutes both portfolio
  pieces.
- **No deploy at all, library-only** — rejected: the dashboard is a major demoable surface;
  a live link is worth the small effort.

### Consequences
- A deliberately failing PR that trips the eval gate becomes the single most impressive demo
  artifact.
- Deploy effort stays minimal; engineering effort concentrates on the core + gate + dashboard.

---

## ADR-0015 — ESLint + Prettier with type-aware rules (over Biome)

**Date:** 2026-06-04
**Status:** Accepted

### Context
Modern TypeScript projects have two reasonable linting/formatting stacks: **ESLint + Prettier
+ typescript-eslint** (mature, ecosystem-heavy, two tools, slower) or **Biome** (one tool,
~10-100x faster, opinionated, smaller plugin surface). Yardstick's domain is async-heavy:
every eval case awaits a Claude call, every scorer pipeline runs concurrently per case, and
a forgotten `await` would silently return a Promise as the "model output" and corrupt run
results without failing any test.

### Decision
**ESLint + Prettier**, with the `typescript-eslint` **type-checked** preset enabled. The
load-bearing rules are `no-floating-promises`, `no-misused-promises`, and `await-thenable` —
all three require type information and have no full equivalent in Biome at time of writing.

### Alternatives considered
- **Biome** — rejected for this project: the speed and one-tool ergonomics are real wins, but
  the missing type-aware async checks are exactly the safety net Yardstick needs. For a
  project whose entire premise is "test nondeterministic async systems," shipping without
  `no-floating-promises` would be embarrassing if a real bug slipped through.
- **deno lint / oxc / rome (defunct)** — rejected: smaller ecosystems still, no clear win
  over either incumbent.
- **Prettier only, no linter** — rejected: forfeits the bug-catching value entirely.

### Consequences
- Two configs (`.eslintrc`, `.prettierrc`) and slower CI lint step vs Biome. Acceptable.
- `parserOptions.project` must point at `tsconfig.json` so type-aware rules work — slows
  local lint slightly but is non-negotiable for the rules above.
- Reviewers see industry-standard tooling, which is a small but real polish signal.
- If Biome ships full type-aware async checks later, this decision is worth revisiting.

---

## ADR-0014 — Validate every external input with zod at the boundary

**Date:** 2026-06-04
**Status:** Accepted

### Context
External inputs: suite config files, env vars, judge JSON output, cache files on disk. Any
of these can be malformed and crash the runner mid-eval.

### Decision
**zod** parses every external input at the boundary. Internal code receives already-typed
objects and never re-validates. Validation failures throw a typed `ConfigError` distinct
from retryable network errors.

### Alternatives considered
- **TS types only, trust the input** — rejected: silently corrupts run data on bad config.
- **JSON Schema + ajv** — rejected: zod gives the same guarantees with a much nicer TS-native
  ergonomics and inferred types.

### Consequences
- One layer of trust: outside zod = unknown, inside = typed.
- Errors at startup are clear and pointable instead of weird mid-run failures.

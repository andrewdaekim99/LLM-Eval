# Project Direction — "Yardstick" (working title)

> A **Claude-native LLM evaluation & observability harness**: a TypeScript library + CLI
> for defining eval suites, scoring model outputs with multiple scorers (deterministic and
> LLM-as-judge), tracking results across prompt versions, and gating CI on regressions —
> plus a dashboard that turns runs into trends, diffs, and failure drill-downs.
>
> Think of it as the "tests + observability" layer that every team shipping LLM features
> needs but almost no portfolio shows. *"Yardstick" = a measuring tool; rename freely.*

---

## 0. How to use this file

This is the north-star document for the project. Keep it in the repo root. Claude Code
auto-loads a `CLAUDE.md`, so either **save this as `CLAUDE.md`** or keep it as
`PROJECT_DIRECTION.md` and reference it from a short `CLAUDE.md`. Prefer the decisions and
conventions written here over improvised ones, and ask before deviating.

This is the **second** portfolio project, the companion to the integration/sync engine
("Patchbay"). The two are deliberately complementary — see §10.

---

## 1. Why this project exists (the goal)

A portfolio centerpiece that proves three things recruiters and hiring managers care about,
on a *different axis* than the integration engine:

1. **AI-forward depth that's real** — not "I called an LLM API once," but "I understand the
   production AI lifecycle: prompts as versioned artifacts, evals, regression gates,
   cost/latency tracking." This is a rare, in-demand signal in 2026.
2. **Balanced full-stack ability** — a clean library/CLI core *plus* a polished Next.js
   dashboard. (Same balance as the engine, different domain.)
3. **Engineering judgment around nondeterminism** — the hard, interview-worthy part:
   how do you write reliable tests for a system that isn't deterministic?

The through-line across both projects becomes a one-sentence pitch:
**"I make unreliable systems reliable — flaky third-party integrations in one project,
nondeterministic LLMs in the other."** Every design decision below should be something the
author can explain and defend in an interview.

---

## 2. Scope decisions (locked)

- **Shape:** Both — a library core (`@yardstick/core`) with a CLI on top, *and* a dashboard
  that reads the runs. The library is the product; the dashboard makes it demoable.
- **Provider:** **Claude-only.** This is a deliberate choice, not a limitation — it keeps
  scope tight and ties to the author's Claude/Claude Code workflow. Note for interviews:
  the scorer/runner interfaces are provider-agnostic by design, so "add OpenAI" is a
  one-adapter change — you just chose not to spend scope there.
- **Demo content:** a **mix of example eval suites** (see §6) that each exercise a different
  scorer type, so the tool's range is obvious at a glance.

---

## 3. What it actually does (core loop)

1. **Define a suite** in code/config: a set of cases, each with an input, the prompt/system
   prompt + pinned model ID, and one or more scorers describing "what good looks like."
2. **Run it.** The runner calls Claude, captures output + tokens + latency + cost, and
   applies every scorer to produce per-case scores.
3. **Score it.** Scorers range from cheap/deterministic to fuzzy:
   - `exactMatch` / `regex` / `contains`
   - `jsonSchema` (valid structure) + `fieldAccuracy` (right values) — the workhorse for
     extraction tasks
   - `llmJudge` — Claude grades the output against a rubric (for open-ended tasks)
4. **Persist it.** Every run is written as a portable JSON artifact *and* to a local SQLite
   history DB, keyed by suite + prompt version + model ID.
5. **Compare it.** Diff two runs (e.g., prompt v3 vs v4): which cases improved, regressed,
   cost more, got slower.
6. **Gate it.** A GitHub Action runs the suites on every PR and **fails the build** if pass
   rate drops below threshold or cost/latency regress. This is the headline "ops" feature.

---

## 4. The moat (where depth & test coverage concentrate)

These are the parts that separate this from a weekend "I ran some prompts" repo. Spend the
engineering and the test coverage here:

- **Reproducibility.** Pinned model IDs (not aliases), response **caching** keyed by
  (model, prompt, input) so reruns are free and deterministic, and recorded run metadata.
- **LLM-as-judge done properly.** The judge is itself a source of error, so: a written
  rubric, structured (JSON) judge output with a reason, and **bias mitigation** —
  randomize answer position, avoid self-preference, optionally average over N judge samples.
  Be ready to explain *why the judge needs validating too*.
- **Handling nondeterminism.** Don't pretend outputs are stable. Support sampling each case
  N times and reporting **pass@k** / pass-rate with variance, so a single lucky/unlucky
  generation doesn't flip the build. Gate on aggregates, not single runs.
- **Observability.** Per-run and trend-over-time tracking of pass rate, cost, tokens, and
  latency. Cost is computed from current Claude pricing in a small pricing table.

---

## 5. Tech stack

- **Monorepo:** pnpm workspaces (or Turborepo) — `packages/core`, `packages/cli`,
  `apps/dashboard`.
- **Language:** TypeScript everywhere (plays to existing strengths; clean public types are
  part of the deliverable).
- **Model access:** official Anthropic TS SDK (`@anthropic-ai/sdk`), Messages API.
  - **Defaults:** system-under-test = **Claude Haiku 4.5** (`claude-haiku-4-5`) to keep demo
    runs cheap; **judge = Claude Sonnet 4.6** (`claude-sonnet-4-6`), with Opus 4.8
    (`claude-opus-4-8`) selectable for the hardest rubrics. All IDs are pinned snapshots.
- **Storage:** SQLite (better-sqlite3 or Prisma) for run history; JSON artifacts as the
  portable, git-diffable format.
- **Semantic / fuzzy scoring under the Claude-only constraint:** prefer **`llmJudge`** as the
  primary fuzzy scorer. If a similarity score is wanted, use a **local** embedding model
  (e.g., transformers.js, runs offline) rather than a third-party embeddings API — this keeps
  the Claude-only promise honest and is a nice decision to call out.
- **Dashboard:** Next.js + Tailwind + Recharts. Reads the SQLite DB / JSON artifacts. Views:
  run list, per-suite pass-rate over time, prompt-version diff (side-by-side expected vs
  actual on failing cases), cost/latency charts.
- **Tooling/ops:** Docker for the dashboard; **GitHub Actions** for the eval gate (the gate
  is itself the product's most demoable feature).

---

## 6. The example suites (the "mix")

Ship at least the first three; each is chosen to exercise a *different* scorer so the range
is self-evident:

1. **Structured extraction** — pull fields from messy free text into a JSON object (e.g.,
   parse a shipping address or an order line). Scored by `jsonSchema` + `fieldAccuracy`.
   *(Deliberately echoes the author's integration/mapping work.)*
2. **Classification** — intent or sentiment labeling. Scored by `exactMatch` / accuracy,
   with a confusion matrix in the report.
3. **Open-ended generation** — summarize or answer from a passage. Scored by `llmJudge`
   against a faithfulness/relevance rubric. This is where the judge machinery earns its keep.
4. *(Optional)* **Format/robustness** — does the model stay in valid JSON, refuse
   out-of-scope asks, respect length limits. Scored by deterministic checks.

---

## 7. Build roadmap

- **Phase 0 — Scaffold.** Monorepo, Anthropic client wrapper, core types (`Suite`, `Case`,
  `Scorer`, `RunResult`), env/config, `.env.example`.
- **Phase 1 — Runnable core.** Runner + deterministic scorers (`exactMatch`, `jsonSchema`,
  `fieldAccuracy`), the extraction suite, JSON artifact output. `yardstick run` works.
- **Phase 2 — Judge + observability.** `llmJudge` with rubric + bias mitigation, response
  caching, cost/latency/token capture, SQLite history, run-to-run diff.
- **Phase 3 — CI gate.** CLI polish (`yardstick report`, thresholds), the GitHub Action,
  pass@k / variance handling, regression gating.
- **Phase 4 — Dashboard.** Next.js app: run list, trends, version diff, failure drill-down.
- **Phase 5 — Fill out + ship.** Remaining suites, README with screenshots + a sample CI run
  that visibly fails on a regression, one-command setup, optional dashboard deploy.

---

## 8. Infra / deploy scope (intentionally different from the engine)

The engine carries the heavy AWS story (Fargate/SQS/RDS). **This project should NOT repeat
that** — two projects both shouting "I can deploy to AWS" is redundant. Here the "ops"
narrative is **CI/CD + developer experience**:

- Local + `docker-compose` is the daily driver.
- The **GitHub Actions eval gate** is the headline — a real PR that fails because a prompt
  change regressed quality is the single most impressive thing to show.
- Dashboard deploy is optional and lightweight (Vercel or a single container) — just enough
  for a live link.

Cost discipline: cheap default model + response caching + small suites keep API spend near
zero.

---

## 9. Interview talking points (design these in on purpose)

- How do you test a nondeterministic system without flaky CI? (pass@k, thresholds, variance,
  caching, pinned IDs)
- Why does an LLM judge need its own validation, and how do you reduce its biases?
- When is a cheap deterministic scorer enough vs. when do you reach for a judge?
- How would you extend to multiple providers? (the adapter seam already exists)
- What does "a prompt regression" even mean, and how do you gate on it responsibly?

---

## 10. How this pairs with the integration engine

- **Different axis, shared spine.** Engine = backend/platform/reliability with light AI.
  Yardstick = AI-forward/DevEx with light backend. Together they show range, and both are
  about *reliability* — that's the portfolio's unifying story.
- **Optional bridge (don't force it):** later, point a Yardstick suite at the engine's
  AI "Mapping Studio" to evaluate its field-mapping suggestions. One sentence in each
  README cross-linking the two projects makes the portfolio feel like a body of work, not
  two unrelated repos.

---

## 11. Non-goals

- Not a general ML experiment tracker (not MLflow/W&B).
- Not multi-provider — Claude-only, by choice.
- Not a hosted SaaS — it's a self-hostable library + CLI + dashboard.
- No auth/multi-tenant/billing. Keep scope on the eval + observability core.

---

## 12. GitHub presentation (matters as much as the code)

- README with a hero screenshot of the dashboard and an animated/GIF of `yardstick run`.
- A visible **failing CI run** from a deliberate prompt regression (link it).
- Architecture diagram (core ↔ runner ↔ scorers ↔ storage ↔ dashboard / CI).
- One-command local setup (`pnpm i && pnpm dev` or `docker-compose up`).
- A short "why these reliability decisions" section — the same instinct that makes the
  engine's README strong.

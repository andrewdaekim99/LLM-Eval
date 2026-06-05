# @yardstick/dashboard

A read-only Next.js dashboard over the SQLite history + JSON run artifacts produced by
`@yardstick/core`. It renders:

- **Run list** (`/runs`) — every run with pass-rate, cost, p95 latency, cache hit rate, plus
  suite + date-range filters.
- **Run detail** (`/runs/[runId]`) — summary card and the case-by-case results table.
- **Failure drill-down** (`/runs/[runId]/cases/[caseId]`) — prompt + input + expectation +
  per-sample outputs, llmJudge verdicts with rubric, and a side-by-side comparison against
  the most recent run where that case last passed.
- **Suite trend** (`/suites/[suite]`) — Recharts line charts of pass-rate, cost, and p95
  latency over time.
- **Diff** (`/diff?a=<runId>&b=<runId>`) — pass-rate / cost / latency deltas and regressed
  / fixed / still-failing case groups, with links into the drill-down for each case.

## Quickstart

```bash
# from the repo root
pnpm install
pnpm yardstick run suites/extraction.ts   # produce at least one run
pnpm yardstick rebuild-db                 # index existing artifacts (optional)

pnpm --filter @yardstick/dashboard dev    # open http://localhost:3000
```

The dashboard reads `DATABASE_URL` and `CACHE_DIR` from `.env` at the **workspace root**
— a `.env.local` symlink under `apps/dashboard/` keeps Next happy without duplicating
secrets.

## Architecture

The dashboard never calls the Anthropic API. `apps/dashboard/lib/data.ts` is the only
data path; it's marked `import "server-only"` so it cannot accidentally land in a client
bundle. See [`DECISIONS.md` ADR-0017](../../DECISIONS.md) for why we read SQLite from
server components rather than expose `/api/*` routes.

- Server reads → `lib/db.ts` (a `globalThis`-cached `HistoryDb` so dev-mode HMR doesn't
  leak handles) → `@yardstick/core` (`listRuns`, `getCases`, `getSamples`,
  `getJudgeVerdicts`, `getCaseHistory`, `diffCases`, `readArtifact`).
- Filters live in URL search params (`?suite=`, `?from=`, `?to=`, `?a=&b=`).
- Client components are limited to `<Filters>`, `<DiffPicker>`, and `<SuiteTrendChart>`
  (Recharts requires a browser).
- shadcn/ui primitives (new-york style, neutral base) live under `components/ui/` —
  vendored into the repo, no runtime dep.

## Running in Docker

```bash
docker compose up --build
```

Compose mounts `./runs` and `./.cache` from the host as read-only volumes, so the
container sees the same artifacts the CLI just wrote. `ANTHROPIC_API_KEY` is stubbed
with a placeholder — the dashboard never reads it, but `loadConfig()` requires it
non-empty (CLAUDE.md golden rule 7).

## Tests

```bash
pnpm test
```

Vitest + React Testing Library cover the headline behaviors: run list rendering, diff
grouping, judge verdict rendering, and sample-panel pass/fail badges. All tests mock
the data layer; no real SQLite handle is opened from a component test.

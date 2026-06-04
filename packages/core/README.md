# @yardstick/core

Core library for Yardstick: types, the cached Anthropic client wrapper, env config, pricing,
and (in later phases) the runner, scorers, judge, and SQLite history.

This package is **provider-agnostic at the interface level** (`ModelClient`,
`ModelTransport`, `Scorer`) even though only the Claude adapter ships. See `DECISIONS.md`
ADR-0001.

## Public surface (Phase 0)

- `loadConfig(env?)` — parses and validates env vars with zod; rejects model aliases.
- `CachedModelClient` — disk-cached `ModelClient` implementation (ADR-0004).
- `AnthropicTransport` — concrete transport wrapping `@anthropic-ai/sdk`.
- `cacheKey(req)` — deterministic key derivation for inspection / tests.
- `costOf({ inputTokens, outputTokens, model })` — USD cost from a pricing table.
- `getLogger()` / `childLogger(fields)` — structured logging (no `console.log` in lib code).
- Types: `Suite`, `Case`, `Scorer`, `Score`, `RunResult`, `JudgeVerdict`, `GenerateRequest`,
  `GenerateResponse`, `ModelClient`, `ModelTransport`, `ConfigError`, `RetryableError`.

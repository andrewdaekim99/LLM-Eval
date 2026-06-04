# Suites

Eval suites live here. Each suite is a TypeScript module that exports a `Suite` object
(see `@yardstick/core` types).

## Suite shape (preview)

```ts
import type { Suite } from "@yardstick/core";

export const extraction: Suite<MyInput, MyExpectation> = {
  name: "extraction",
  promptVersion: "v1",
  params: { model: "claude-haiku-4-5", maxTokens: 1024, temperature: 0 },
  buildPrompt: (input) => [{ role: "user", content: `... ${input.text}` }],
  cases: [
    /* ... */
  ],
  scorers: [
    /* jsonSchema, fieldAccuracy, ... */
  ],
  thresholds: { passRate: 0.85, maxCostUSD: 0.05 },
};
```

## Conventions

- One suite per file. File name matches the suite name (`extraction.ts`).
- Pin model IDs (no aliases — see `DECISIONS.md` ADR-0005).
- Keep `temperature: 0` unless the suite is specifically testing sampling behavior.
- Cases live inline in the suite file unless you need them shared across suites.
- Bump `promptVersion` whenever the prompt or generation params change; this preserves the
  immutable-runs guarantee (ADR-0008).

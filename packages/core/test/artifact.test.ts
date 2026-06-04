import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ARTIFACT_SCHEMA_VERSION,
  RunArtifactSchema,
  artifactPath,
  migrateArtifact,
  persistArtifact,
  toArtifact,
} from "../src/artifact.js";
import type { RunResult } from "../src/types.js";

function makeRun(overrides: Partial<RunResult> = {}): RunResult {
  return {
    runId: "00000000-0000-0000-0000-000000000001",
    suite: "extraction",
    promptVersion: "v1",
    model: "claude-haiku-4-5",
    startedAt: "2026-06-04T16:48:22.000Z",
    finishedAt: "2026-06-04T16:48:25.000Z",
    cases: [
      {
        caseId: "case-a",
        input: { text: "raw input" },
        expectation: { name: "Jane" },
        passed: true,
        aggregateScores: [{ scorer: "exactMatch", value: 1, passed: true }],
        samples: [
          {
            output: "ok",
            scores: [{ scorer: "exactMatch", value: 1, passed: true }],
            inputTokens: 10,
            outputTokens: 5,
            costUSD: 0.00004,
            latencyMs: 100,
            cacheHit: false,
            stopReason: "end_turn",
          },
        ],
      },
    ],
    summary: {
      totalCases: 1,
      passedCases: 1,
      passRate: 1,
      totalCostUSD: 0.00004,
      totalInputTokens: 10,
      totalOutputTokens: 5,
      latencyMsP50: 100,
      latencyMsP95: 100,
      cacheHitRate: 0,
    },
    ...overrides,
  };
}

describe("artifactPath", () => {
  it("encodes timestamp, suite, and prompt version in the filename", () => {
    const p = artifactPath({
      outputDir: "/runs",
      suite: "extraction",
      promptVersion: "v1",
      startedAt: "2026-06-04T16:48:22.000Z",
    });
    expect(p).toMatch(/20260604T164822-extraction-v1\.json$/);
  });

  it("slugifies unsafe characters in suite and version names", () => {
    const p = artifactPath({
      outputDir: "/runs",
      suite: "My Suite!",
      promptVersion: "v 2 / experimental",
      startedAt: "2026-06-04T16:48:22.000Z",
    });
    expect(p).toMatch(/my-suite-v-2-experimental\.json$/);
  });
});

describe("toArtifact / schema", () => {
  it("round-trips through the artifact schema with input + expectation", () => {
    const artifact = toArtifact(makeRun());
    const parsed = RunArtifactSchema.safeParse(artifact);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.schemaVersion).toBe(ARTIFACT_SCHEMA_VERSION);
      expect(parsed.data.cases).toHaveLength(1);
      expect(parsed.data.cases[0]?.input).toEqual({ text: "raw input" });
      expect(parsed.data.cases[0]?.expectation).toEqual({ name: "Jane" });
    }
  });

  it("preserves optional reason and detail fields on scores", () => {
    const run = makeRun({
      cases: [
        {
          caseId: "case-a",
          input: "some input",
          expectation: { ok: true },
          passed: false,
          aggregateScores: [
            { scorer: "fieldAccuracy", value: 0.5, passed: false, reason: "1/2 fields" },
          ],
          samples: [
            {
              output: "x",
              scores: [
                {
                  scorer: "fieldAccuracy",
                  value: 0.5,
                  passed: false,
                  reason: "1/2 fields",
                  detail: { correct: 1, total: 2 },
                },
              ],
              inputTokens: 10,
              outputTokens: 5,
              costUSD: 0.00004,
              latencyMs: 100,
              cacheHit: false,
              stopReason: "end_turn",
            },
          ],
        },
      ],
    });
    const artifact = toArtifact(run);
    expect(artifact.cases[0]?.samples[0]?.scores[0]?.reason).toBe("1/2 fields");
    expect(artifact.cases[0]?.samples[0]?.scores[0]?.detail).toEqual({ correct: 1, total: 2 });
  });
});

describe("migrateArtifact", () => {
  it("returns v2 artifacts unchanged", () => {
    const artifact = toArtifact(makeRun());
    const migrated = migrateArtifact(JSON.parse(JSON.stringify(artifact)));
    expect(migrated.schemaVersion).toBe(ARTIFACT_SCHEMA_VERSION);
    expect(migrated.cases[0]?.input).toEqual({ text: "raw input" });
  });

  it("upgrades a v1 artifact to v2 with null input + expectation", () => {
    const v1 = {
      schemaVersion: 1,
      runId: "11111111-1111-1111-1111-111111111111",
      suite: "extraction",
      promptVersion: "v1",
      model: "claude-haiku-4-5",
      startedAt: "2026-06-04T16:48:22.000Z",
      finishedAt: "2026-06-04T16:48:25.000Z",
      cases: [
        {
          caseId: "addr-simple",
          passed: true,
          aggregateScores: [{ scorer: "jsonSchema", value: 1, passed: true }],
          samples: [
            {
              output: '{"name":"John"}',
              scores: [{ scorer: "jsonSchema", value: 1, passed: true }],
              inputTokens: 50,
              outputTokens: 20,
              costUSD: 0.00015,
              latencyMs: 400,
              cacheHit: false,
              stopReason: "end_turn",
            },
          ],
        },
      ],
      summary: {
        totalCases: 1,
        passedCases: 1,
        passRate: 1,
        totalCostUSD: 0.00015,
        totalInputTokens: 50,
        totalOutputTokens: 20,
        latencyMsP50: 400,
        latencyMsP95: 400,
        cacheHitRate: 0,
      },
    };

    const migrated = migrateArtifact(v1);
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.cases[0]?.caseId).toBe("addr-simple");
    expect(migrated.cases[0]?.input).toBeNull();
    expect(migrated.cases[0]?.expectation).toBeNull();
    expect(migrated.cases[0]?.passed).toBe(true);
    expect(migrated.summary.passRate).toBe(1);
  });

  it("rejects artifacts with no schemaVersion", () => {
    expect(() => migrateArtifact({ runId: "x" })).toThrow(/schemaVersion/);
  });

  it("rejects artifacts with a future schemaVersion", () => {
    expect(() => migrateArtifact({ schemaVersion: 99 })).toThrow(/unsupported/);
  });

  it("rejects non-object payloads", () => {
    expect(() => migrateArtifact("not an artifact")).toThrow();
    expect(() => migrateArtifact(null)).toThrow();
  });
});

describe("persistArtifact", () => {
  let outputDir: string;

  beforeEach(async () => {
    outputDir = await mkdtemp(join(tmpdir(), "yardstick-runs-"));
  });

  afterEach(async () => {
    await rm(outputDir, { recursive: true, force: true });
  });

  it("writes a parseable JSON artifact to disk", async () => {
    const { path, artifact } = await persistArtifact(makeRun(), outputDir);
    const raw = await readFile(path, "utf8");
    const parsed = RunArtifactSchema.parse(JSON.parse(raw));
    expect(parsed.runId).toBe(artifact.runId);
    expect(parsed.cases).toHaveLength(1);
    expect(parsed.cases[0]?.input).toEqual({ text: "raw input" });
  });
});

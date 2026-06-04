import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ARTIFACT_SCHEMA_VERSION,
  RunArtifactSchema,
  artifactPath,
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
  it("round-trips through the artifact schema", () => {
    const artifact = toArtifact(makeRun());
    const parsed = RunArtifactSchema.safeParse(artifact);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.schemaVersion).toBe(ARTIFACT_SCHEMA_VERSION);
      expect(parsed.data.cases).toHaveLength(1);
    }
  });

  it("preserves optional reason and detail fields on scores", () => {
    const run = makeRun({
      cases: [
        {
          caseId: "case-a",
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
  });
});

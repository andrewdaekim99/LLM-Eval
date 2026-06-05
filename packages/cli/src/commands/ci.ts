// `yardstick ci` — runs configured suites, applies the regression gate per-suite, writes
// a Markdown summary to $GITHUB_STEP_SUMMARY when present, exits non-zero on any failure.
// This is the project's headline feature (PROJECT_DIRECTION.md §8).

import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import {
  AnthropicTransport,
  CachedModelClient,
  HistoryDb,
  applyGate,
  loadConfig,
  persistArtifact,
  runSuite,
  type GateResult,
  type RunResult,
  type Suite,
} from "@yardstick/core";
import { loadSuiteFromFile } from "../loadSuite.js";
import { formatConfusionMatrix, formatRunSummary } from "../format.js";

export interface CiCommandOptions {
  readonly config: string;
  readonly output: string;
  readonly cache: boolean;
  readonly verbose: boolean;
}

const CiConfigSchema = z.object({
  ciSuites: z.array(z.string()).min(1),
});

interface SuiteOutcome {
  readonly suite: Suite;
  readonly run: RunResult;
  readonly gate: GateResult;
  readonly artifactPath: string;
}

export async function ciCommand(opts: CiCommandOptions): Promise<void> {
  if (opts.verbose) process.env.LOG_LEVEL = "debug";

  const cfg = loadConfig();
  const ciCfg = await loadCiConfig(opts.config);

  const cacheDir = resolve(process.cwd(), cfg.CACHE_DIR);
  const transport = new AnthropicTransport({ apiKey: cfg.ANTHROPIC_API_KEY });
  const client = new CachedModelClient({
    transport,
    cacheDir,
    bypassCache: !opts.cache,
  });

  const outputDir = resolve(process.cwd(), opts.output);
  const dbPath = resolve(process.cwd(), cfg.DATABASE_URL);
  const db = new HistoryDb({ path: dbPath });

  const outcomes: SuiteOutcome[] = [];
  try {
    for (const suitePath of ciCfg.ciSuites) {
      const suite = await loadSuiteFromFile(suitePath);
      const run = await runSuite(suite, { client });
      const { artifact, path } = await persistArtifact(run, outputDir);
      db.insertRun(artifact, path);
      const gate = applyGate(run, suite.thresholds);
      outcomes.push({ suite, run, gate, artifactPath: path });
    }
  } finally {
    db.close();
  }

  const colors = process.stdout.isTTY === true;
  process.stdout.write(`${formatHumanReport(outcomes, colors)}\n`);

  const stepSummary = process.env.GITHUB_STEP_SUMMARY;
  if (stepSummary) {
    await appendFile(stepSummary, `${formatMarkdownReport(outcomes)}\n`, "utf8");
  }

  const allPassed = outcomes.every((o) => o.gate.passed);
  process.exit(allPassed ? 0 : 1);
}

async function loadCiConfig(configPath: string): Promise<z.infer<typeof CiConfigSchema>> {
  const path = resolve(process.cwd(), configPath);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`config not found at ${path}; create a yardstick.config.json`);
    }
    throw err;
  }
  return CiConfigSchema.parse(JSON.parse(raw));
}

function formatHumanReport(outcomes: readonly SuiteOutcome[], colors: boolean): string {
  const sections: string[] = [];
  for (const o of outcomes) {
    sections.push(formatRunSummary(o.run, o.artifactPath, colors));
    if (!o.gate.passed) {
      sections.push("");
      sections.push("GATE FAILURES:");
      for (const r of o.gate.reasons) {
        sections.push(`  ✗ [${r.axis}] ${r.message}`);
      }
    } else {
      sections.push("");
      sections.push("GATE: ✓ passed");
    }
    sections.push("");
  }

  const allPassed = outcomes.every((o) => o.gate.passed);
  sections.push("─".repeat(60));
  sections.push(
    allPassed
      ? `eval-gate: ✓ all ${outcomes.length} suite(s) passed`
      : `eval-gate: ✗ ${outcomes.filter((o) => !o.gate.passed).length}/${outcomes.length} suite(s) failed`,
  );
  return sections.join("\n");
}

/** Markdown report written to $GITHUB_STEP_SUMMARY — renders inline in the PR check. */
function formatMarkdownReport(outcomes: readonly SuiteOutcome[]): string {
  const lines: string[] = [];
  const allPassed = outcomes.every((o) => o.gate.passed);
  const headerIcon = allPassed ? "✅" : "❌";
  lines.push(
    `## ${headerIcon} Yardstick eval gate — ${outcomes.filter((o) => o.gate.passed).length}/${outcomes.length} suite(s) passed`,
  );
  lines.push("");

  lines.push("| suite | pass rate | cost | p95 latency | gate |");
  lines.push("| --- | ---: | ---: | ---: | :---: |");
  for (const o of outcomes) {
    const s = o.run.summary;
    const pct = (s.passRate * 100).toFixed(1);
    const cost =
      s.totalCostUSD < 0.01 ? `$${s.totalCostUSD.toFixed(6)}` : `$${s.totalCostUSD.toFixed(4)}`;
    const icon = o.gate.passed ? "✅" : "❌";
    lines.push(
      `| \`${o.run.suite}@${o.run.promptVersion}\` | ${s.passedCases}/${s.totalCases} (${pct}%) | ${cost} | ${Math.round(s.latencyMsP95)}ms | ${icon} |`,
    );
  }
  lines.push("");

  for (const o of outcomes) {
    if (o.gate.passed) continue;
    lines.push(`### ❌ \`${o.run.suite}@${o.run.promptVersion}\` failed`);
    for (const r of o.gate.reasons) {
      lines.push(`- **${r.axis}**: ${r.message}`);
    }
    const failedCases = o.run.cases.filter((c) => !c.passed);
    if (failedCases.length > 0) {
      lines.push("");
      lines.push("<details><summary>Failing cases</summary>");
      lines.push("");
      for (const c of failedCases) {
        const reasons = c.aggregateScores
          .filter((s) => !s.passed)
          .map((s) => `${s.scorer}: ${s.reason ?? "fail"}`)
          .join("; ");
        lines.push(`- \`${c.caseId}\` — ${reasons}`);
      }
      lines.push("");
      lines.push("</details>");
    }
    lines.push("");
  }

  // Embed confusion matrices in fenced blocks for any classification suites.
  for (const o of outcomes) {
    const matrix = formatConfusionMatrix(o.run);
    if (matrix) {
      lines.push(`### \`${o.run.suite}\` confusion matrix`);
      lines.push("```");
      lines.push(matrix);
      lines.push("```");
      lines.push("");
    }
  }

  return lines.join("\n");
}

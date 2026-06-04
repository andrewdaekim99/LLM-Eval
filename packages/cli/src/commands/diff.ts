import { resolve } from "node:path";
import {
  HistoryDb,
  diffCases,
  loadConfig,
  meanScoreValue,
  type CaseDiff,
  type StoredCase,
} from "@yardstick/core";

export interface DiffCommandOptions {
  readonly runA: string;
  readonly runB: string;
}

export function diffCommand(opts: DiffCommandOptions): void {
  const cfg = loadConfig();
  const dbPath = resolve(process.cwd(), cfg.DATABASE_URL);
  const db = new HistoryDb({ path: dbPath });

  try {
    const a = resolveOrExit(db, opts.runA, "A");
    const b = resolveOrExit(db, opts.runB, "B");

    const summaryA = db.getRunSummary(a);
    const summaryB = db.getRunSummary(b);
    if (!summaryA || !summaryB) {
      process.stderr.write("internal error: resolved id has no summary row\n");
      process.exit(2);
    }

    const casesA = db.getCases(a);
    const casesB = db.getCases(b);
    process.stdout.write(`${formatDiff(summaryA, summaryB, casesA, casesB)}\n`);

    const regressed = diffCases(casesA, casesB).filter((d) => d.kind === "regressed").length;
    process.exit(regressed > 0 ? 1 : 0);
  } finally {
    db.close();
  }
}

function resolveOrExit(db: HistoryDb, prefix: string, label: string): string {
  const resolved = db.resolveRunIdPrefix(prefix);
  if (resolved.ok) return resolved.runId;
  if (resolved.candidates.length === 0) {
    process.stderr.write(`run ${label} ("${prefix}") not found\n`);
  } else {
    process.stderr.write(
      `run ${label} ("${prefix}") is ambiguous; candidates:\n${resolved.candidates
        .map((c) => `  ${c}`)
        .join("\n")}\n`,
    );
  }
  process.exit(2);
}

interface SummaryShape {
  readonly runId: string;
  readonly suite: string;
  readonly promptVersion: string;
  readonly model: string;
  readonly passedCases: number;
  readonly totalCases: number;
  readonly passRate: number;
  readonly totalCostUSD: number;
  readonly latencyMsP95: number;
}

export function formatDiff(
  a: SummaryShape,
  b: SummaryShape,
  casesA: readonly StoredCase[],
  casesB: readonly StoredCase[],
): string {
  const lines: string[] = [];
  lines.push(`A: ${a.runId.slice(0, 8)}  ${a.suite}@${a.promptVersion}  ${a.model}`);
  lines.push(`B: ${b.runId.slice(0, 8)}  ${b.suite}@${b.promptVersion}  ${b.model}`);
  lines.push("─".repeat(60));

  const diffs = diffCases(casesA, casesB);
  const regressed = diffs.filter((d) => d.kind === "regressed");
  const fixed = diffs.filter((d) => d.kind === "fixed");
  const newCases = diffs.filter((d) => d.kind === "new");
  const removed = diffs.filter((d) => d.kind === "removed");

  if (regressed.length > 0) {
    lines.push(`regressed (${regressed.length}):`);
    for (const d of regressed) lines.push(`  - ${d.caseId}${scoreDeltaTail(d)}`);
  }
  if (fixed.length > 0) {
    lines.push(`fixed (${fixed.length}):`);
    for (const d of fixed) lines.push(`  + ${d.caseId}${scoreDeltaTail(d)}`);
  }
  if (newCases.length > 0) {
    lines.push(`new cases (${newCases.length}):`);
    for (const d of newCases) lines.push(`  * ${d.caseId}`);
  }
  if (removed.length > 0) {
    lines.push(`removed cases (${removed.length}):`);
    for (const d of removed) lines.push(`  ! ${d.caseId}`);
  }
  if (
    regressed.length === 0 &&
    fixed.length === 0 &&
    newCases.length === 0 &&
    removed.length === 0
  ) {
    lines.push("no case-level changes.");
  }

  lines.push("");
  lines.push(
    `pass rate:  ${a.passedCases}/${a.totalCases} (${pct(a.passRate)})  →  ${b.passedCases}/${b.totalCases} (${pct(b.passRate)})  ${formatDelta(b.passRate - a.passRate, "passrate")}`,
  );
  lines.push(
    `cost:       ${usd(a.totalCostUSD)}  →  ${usd(b.totalCostUSD)}  ${formatDelta(b.totalCostUSD - a.totalCostUSD, "cost")}`,
  );
  lines.push(
    `p95 lat:    ${Math.round(a.latencyMsP95)}ms  →  ${Math.round(b.latencyMsP95)}ms  ${formatDelta(b.latencyMsP95 - a.latencyMsP95, "latency")}`,
  );

  return lines.join("\n");
}

function scoreDeltaTail(d: CaseDiff): string {
  const av = meanScoreValue(d.aScores);
  const bv = meanScoreValue(d.bScores);
  if (av === null || bv === null) return "";
  return `  (${av.toFixed(2)} → ${bv.toFixed(2)})`;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function usd(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(6)}`;
  return `$${n.toFixed(4)}`;
}

function formatDelta(delta: number, axis: "passrate" | "cost" | "latency"): string {
  if (delta === 0) return "(no change)";
  const sign = delta > 0 ? "+" : "";
  const formatted =
    axis === "passrate"
      ? `${sign}${(delta * 100).toFixed(1)}%`
      : axis === "cost"
        ? `${sign}${usd(delta)}`
        : `${sign}${Math.round(delta)}ms`;
  // pass-rate higher is better; cost/latency lower is better.
  const better = axis === "passrate" ? delta > 0 : delta < 0;
  return `(${formatted} ${better ? "✓ better" : "✗ worse"})`;
}

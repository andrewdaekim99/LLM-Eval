import { resolve } from "node:path";
import { HistoryDb, loadConfig, type RunListEntry } from "@yardstick/core";

export interface HistoryCommandOptions {
  readonly suite?: string;
  readonly limit: number;
}

export function historyCommand(opts: HistoryCommandOptions): void {
  const cfg = loadConfig();
  const dbPath = resolve(process.cwd(), cfg.DATABASE_URL);
  const db = new HistoryDb({ path: dbPath });

  try {
    const runs = db.listRuns({
      limit: opts.limit,
      ...(opts.suite !== undefined && { suite: opts.suite }),
    });
    if (runs.length === 0) {
      process.stderr.write(
        opts.suite
          ? `no runs found for suite "${opts.suite}". have you run \`yardstick run\`?\n`
          : "no runs found. have you run `yardstick run`?\n",
      );
      process.exit(0);
    }
    process.stdout.write(`${formatHistoryTable(runs)}\n`);
  } finally {
    db.close();
  }
}

export function formatHistoryTable(runs: readonly RunListEntry[]): string {
  const rows: string[][] = [
    ["started", "suite", "version", "pass", "cost", "p95", "cache", "run id"],
  ];

  for (const r of runs) {
    rows.push([
      shortStarted(r.startedAt),
      r.suite,
      r.promptVersion,
      `${r.passedCases}/${r.totalCases} (${formatPct(r.passRate)})`,
      formatUSD(r.totalCostUSD),
      `${Math.round(r.latencyMsP95)}ms`,
      formatPct(r.cacheHitRate),
      r.runId.slice(0, 8),
    ]);
  }

  return renderTable(rows);
}

function shortStarted(iso: string): string {
  // 2026-06-04T17:19:58.471Z → 2026-06-04 17:19
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

function formatUSD(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(6)}`;
  return `$${n.toFixed(4)}`;
}

function formatPct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

function renderTable(rows: string[][]): string {
  if (rows.length === 0) return "";
  const widths = rows[0]!.map((_, col) => Math.max(...rows.map((r) => (r[col] ?? "").length)));
  const formatRow = (r: string[]): string =>
    r.map((cell, i) => (cell ?? "").padEnd(widths[i] ?? 0)).join("  ");
  return [
    formatRow(rows[0]!),
    widths.map((w) => "─".repeat(w)).join("  "),
    ...rows.slice(1).map(formatRow),
  ].join("\n");
}

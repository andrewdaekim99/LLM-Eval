// The regression gate. Pure function over (RunResult, SuiteThresholds) → pass/fail.
// Operates on aggregates (ADR-0009) — pass-rate, total cost, p95 latency — never on a
// single sample. The CLI's `ci` command applies this per-suite and exits non-zero on
// any failure across the configured suites.

import type { RunResult, SuiteThresholds } from "./types.js";

export type GateAxis = "passRate" | "passAtK" | "cost" | "latency";

export interface GateFailureReason {
  readonly axis: GateAxis;
  readonly observed: number;
  readonly threshold: number;
  readonly message: string;
}

export interface GateResult {
  readonly passed: boolean;
  readonly reasons: readonly GateFailureReason[];
}

/**
 * Apply the gate to a single run.
 *
 * Thresholds are checked independently — every failure is reported, not just the first,
 * so a single CI run surfaces every reason the suite tripped. Returns `{ passed: true,
 * reasons: [] }` when no thresholds are set or all are met.
 *
 * Note: `passAtK` is honored *during* sample aggregation (the runner uses it to compute
 * each case's `passed`), so this function trusts `run.summary.passRate` already reflects
 * pass@k semantics for multi-sample cases.
 */
export function applyGate(run: RunResult, thresholds: SuiteThresholds | undefined): GateResult {
  if (!thresholds) return { passed: true, reasons: [] };

  const reasons: GateFailureReason[] = [];

  if (thresholds.passRate !== undefined && run.summary.passRate < thresholds.passRate) {
    reasons.push({
      axis: "passRate",
      observed: run.summary.passRate,
      threshold: thresholds.passRate,
      message: `pass rate ${formatPct(run.summary.passRate)} below threshold ${formatPct(thresholds.passRate)} (${run.summary.passedCases}/${run.summary.totalCases} cases)`,
    });
  }

  if (thresholds.maxCostUSD !== undefined && run.summary.totalCostUSD > thresholds.maxCostUSD) {
    reasons.push({
      axis: "cost",
      observed: run.summary.totalCostUSD,
      threshold: thresholds.maxCostUSD,
      message: `cost ${formatUSD(run.summary.totalCostUSD)} exceeds threshold ${formatUSD(thresholds.maxCostUSD)}`,
    });
  }

  if (
    thresholds.maxLatencyMsP95 !== undefined &&
    run.summary.latencyMsP95 > thresholds.maxLatencyMsP95
  ) {
    reasons.push({
      axis: "latency",
      observed: run.summary.latencyMsP95,
      threshold: thresholds.maxLatencyMsP95,
      message: `p95 latency ${Math.round(run.summary.latencyMsP95)}ms exceeds threshold ${Math.round(thresholds.maxLatencyMsP95)}ms`,
    });
  }

  return { passed: reasons.length === 0, reasons };
}

function formatPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function formatUSD(n: number): string {
  if (n < 0.01) return `$${n.toFixed(6)}`;
  return `$${n.toFixed(4)}`;
}

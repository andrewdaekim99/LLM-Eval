import { computeConfusionMatrix, type CaseResult, type RunResult } from "@yardstick/core";

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

function paint(text: string, color: string, enable: boolean): string {
  return enable ? `${color}${text}${C.reset}` : text;
}

/**
 * Render a one-screen summary of a run for stdout. Colored when `colors` is true
 * (default: TTY-detected by caller).
 */
export function formatRunSummary(run: RunResult, artifactPath: string, colors: boolean): string {
  const lines: string[] = [];
  const title = `${run.suite} (${run.promptVersion}) — ${run.model}`;
  lines.push(paint(`Yardstick — ${title}`, C.bold, colors));
  lines.push(paint("─".repeat(Math.min(72, title.length + 12)), C.dim, colors));

  for (const c of run.cases) {
    lines.push(formatCaseLine(c, colors));
  }

  const s = run.summary;
  const passRatePct = (s.passRate * 100).toFixed(1);
  const passLine = `${s.passedCases}/${s.totalCases} (${passRatePct}%)`;
  const passColored =
    s.passRate === 1
      ? paint(passLine, C.green, colors)
      : s.passRate >= 0.8
        ? paint(passLine, C.yellow, colors)
        : paint(passLine, C.red, colors);

  lines.push("");
  lines.push(`Pass rate: ${passColored}`);
  lines.push(
    `Cost:      ${formatUSD(s.totalCostUSD)}  ·  in ${formatTokens(s.totalInputTokens)} tok  ·  out ${formatTokens(s.totalOutputTokens)} tok`,
  );
  lines.push(`Latency:   p50 ${s.latencyMsP50}ms  ·  p95 ${s.latencyMsP95}ms`);
  lines.push(`Cache:     ${(s.cacheHitRate * 100).toFixed(0)}% hit`);
  lines.push(paint(`Artifact:  ${artifactPath}`, C.cyan, colors));

  const matrix = formatConfusionMatrix(run);
  if (matrix) {
    lines.push("");
    lines.push(matrix);
  }
  return lines.join("\n");
}

/**
 * Render a confusion matrix for a classification-shaped run. Matrix data is computed in
 * core (`computeConfusionMatrix`) so the dashboard can reuse the same shape later.
 */
export function formatConfusionMatrix(run: RunResult): string | null {
  const matrix = computeConfusionMatrix(run);
  if (!matrix) return null;
  const labelWidth = Math.max(8, ...matrix.labels.map((l) => l.length));
  const colWidth = Math.max(3, ...matrix.labels.map((l) => l.length));
  const header = `${"expected ↓ / actual →".padEnd(labelWidth + 2)}${matrix.labels
    .map((l) => l.padStart(colWidth))
    .join("  ")}`;
  const body = matrix.labels.map((e) => {
    const row = matrix.counts.get(e);
    const cells = matrix.labels.map((a) => String(row?.get(a) ?? 0).padStart(colWidth)).join("  ");
    return `${e.padEnd(labelWidth + 2)}${cells}`;
  });
  return ["Confusion matrix:", header, ...body].join("\n");
}

function formatCaseLine(c: CaseResult, colors: boolean): string {
  const mark = c.passed ? paint("✓", C.green, colors) : paint("✗", C.red, colors);
  const failed = c.aggregateScores.filter((s) => !s.passed);
  const detail =
    failed.length === 0
      ? ""
      : paint(
          ` (${failed.map((s) => `${s.scorer}: ${s.reason ?? "fail"}`).join("; ")})`,
          C.dim,
          colors,
        );
  return `  ${mark} ${c.caseId}${detail}`;
}

function formatUSD(n: number): string {
  if (n < 0.01) return `$${n.toFixed(6)}`;
  return `$${n.toFixed(4)}`;
}

function formatTokens(n: number): string {
  return n.toLocaleString("en-US");
}

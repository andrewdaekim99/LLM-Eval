// Compute a confusion matrix from a classification-shaped run. Format-free so the CLI
// and dashboard render it consistently.

import type { RunResult } from "./types.js";

export interface ConfusionMatrix {
  /** Sorted list of all distinct labels seen across expectations and actuals. */
  readonly labels: readonly string[];
  /** Lookup: counts[expected]?.[actual] — defaults to 0 for missing cells. */
  readonly counts: ReadonlyMap<string, ReadonlyMap<string, number>>;
  /** How many cases had an empty / missing output. */
  readonly missingOutputs: number;
}

/**
 * Compute a confusion matrix iff the run looks like a classification:
 *   - every case has exactly one scorer named "exactMatch"
 *   - every expectation is a string label
 *   - distinct-label count fits on screen (< 8)
 *
 * Returns null otherwise so the caller can skip rendering for non-classification runs.
 * Labels are lowercased + trimmed; actuals fall back to "(empty)" when output is empty.
 */
export function computeConfusionMatrix(run: RunResult): ConfusionMatrix | null {
  if (run.cases.length === 0) return null;
  const qualifies = run.cases.every(
    (c) =>
      c.aggregateScores.length === 1 &&
      c.aggregateScores[0]?.scorer === "exactMatch" &&
      typeof c.expectation === "string",
  );
  if (!qualifies) return null;

  const labels = new Set<string>();
  const rows: { expected: string; actual: string }[] = [];
  let missing = 0;
  for (const c of run.cases) {
    const expected = (c.expectation as string).trim().toLowerCase();
    const rawActual = (c.samples[0]?.output ?? "").trim().toLowerCase();
    const actual = rawActual === "" ? "(empty)" : rawActual;
    if (rawActual === "") missing += 1;
    labels.add(expected);
    labels.add(actual);
    rows.push({ expected, actual });
  }
  if (labels.size > 8) return null;

  const sortedLabels = [...labels].sort();
  const counts = new Map<string, Map<string, number>>();
  for (const e of sortedLabels) {
    const row = new Map<string, number>();
    for (const a of sortedLabels) row.set(a, 0);
    counts.set(e, row);
  }
  for (const r of rows) {
    const row = counts.get(r.expected);
    if (!row) continue;
    row.set(r.actual, (row.get(r.actual) ?? 0) + 1);
  }

  return { labels: sortedLabels, counts, missingOutputs: missing };
}

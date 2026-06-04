// Pure case-level diff between two stored runs. Format-free so the CLI, dashboard,
// and CI gate all consume the same shape.

import type { StoredCase, StoredScore } from "./db.js";

export type CaseDiffKind =
  | "regressed"
  | "fixed"
  | "still-passing"
  | "still-failing"
  | "new"
  | "removed";

export interface CaseDiff {
  readonly caseId: string;
  readonly kind: CaseDiffKind;
  readonly aScores?: readonly StoredScore[];
  readonly bScores?: readonly StoredScore[];
}

/**
 * Pairwise diff cases between two runs by `caseId`. Order in the result is alphabetical
 * by case id so output is stable. Cases present in only one side appear as `new` /
 * `removed` so reviewers can spot suite-shape changes.
 */
export function diffCases(a: readonly StoredCase[], b: readonly StoredCase[]): readonly CaseDiff[] {
  const byIdA = new Map(a.map((c) => [c.caseId, c]));
  const byIdB = new Map(b.map((c) => [c.caseId, c]));
  const ids = [...new Set([...byIdA.keys(), ...byIdB.keys()])].sort();

  return ids.map((id) => {
    const ca = byIdA.get(id);
    const cb = byIdB.get(id);
    if (!ca && cb) return { caseId: id, kind: "new", bScores: cb.aggregateScores };
    if (ca && !cb) return { caseId: id, kind: "removed", aScores: ca.aggregateScores };
    if (!ca || !cb) return { caseId: id, kind: "removed" };

    if (ca.passed && !cb.passed) {
      return {
        caseId: id,
        kind: "regressed",
        aScores: ca.aggregateScores,
        bScores: cb.aggregateScores,
      };
    }
    if (!ca.passed && cb.passed) {
      return {
        caseId: id,
        kind: "fixed",
        aScores: ca.aggregateScores,
        bScores: cb.aggregateScores,
      };
    }
    return {
      caseId: id,
      kind: cb.passed ? "still-passing" : "still-failing",
      aScores: ca.aggregateScores,
      bScores: cb.aggregateScores,
    };
  });
}

/** Mean of a score array. Returns null for empty arrays. */
export function meanScoreValue(scores: readonly StoredScore[] | undefined): number | null {
  if (!scores || scores.length === 0) return null;
  return scores.reduce((acc, s) => acc + s.value, 0) / scores.length;
}

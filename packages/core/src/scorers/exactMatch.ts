import type { Score, Scorer } from "../types.js";

/**
 * Pass iff `output` equals `expected` (string equality, optional trimming).
 * The expectation is per-case (the case's `expectation` field).
 */
export function exactMatch(
  opts: { trim?: boolean; caseInsensitive?: boolean } = {},
): Scorer<string, string> {
  const { trim = false, caseInsensitive = false } = opts;

  return {
    name: "exactMatch",
    score(output: string, expected: string): Score {
      const a = normalize(output, trim, caseInsensitive);
      const b = normalize(expected, trim, caseInsensitive);
      const passed = a === b;
      return {
        scorer: "exactMatch",
        value: passed ? 1 : 0,
        passed,
        ...(passed
          ? {}
          : { reason: `expected "${truncate(expected)}", got "${truncate(output)}"` }),
      };
    },
  };
}

function normalize(s: string, trim: boolean, ci: boolean): string {
  let out = s;
  if (trim) out = out.trim();
  if (ci) out = out.toLowerCase();
  return out;
}

function truncate(s: string, max = 80): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

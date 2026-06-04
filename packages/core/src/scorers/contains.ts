import type { Score, Scorer } from "../types.js";

/**
 * Pass iff `output` contains the expected substring. Expectation is per-case.
 */
export function contains(opts: { caseInsensitive?: boolean } = {}): Scorer<string, string> {
  const { caseInsensitive = false } = opts;

  return {
    name: "contains",
    score(output: string, needle: string): Score {
      const haystack = caseInsensitive ? output.toLowerCase() : output;
      const target = caseInsensitive ? needle.toLowerCase() : needle;
      const passed = haystack.includes(target);
      return {
        scorer: "contains",
        value: passed ? 1 : 0,
        passed,
        ...(passed ? {} : { reason: `output did not contain "${truncate(needle)}"` }),
      };
    },
  };
}

function truncate(s: string, max = 80): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

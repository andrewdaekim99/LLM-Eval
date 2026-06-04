import type { Score, Scorer } from "../types.js";

/**
 * Pass iff `pattern` matches the output. The pattern is fixed at suite time;
 * the case's expectation is unused (pass `null`).
 */
export function regex(pattern: RegExp): Scorer<string, unknown> {
  return {
    name: "regex",
    score(output: string): Score {
      const passed = pattern.test(output);
      return {
        scorer: "regex",
        value: passed ? 1 : 0,
        passed,
        ...(passed ? {} : { reason: `output did not match ${pattern.toString()}` }),
      };
    },
  };
}

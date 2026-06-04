import type { z } from "zod";
import type { Score, Scorer } from "../types.js";
import { extractJsonCandidate } from "./jsonSchema.js";

/**
 * Per-field equality between the parsed JSON output and the case's expected object.
 * Partial credit: score = (fields correct) / (fields in expectation).
 *
 * The optional `schema` parses+coerces the output before comparison (e.g. trim strings,
 * normalize casing). Without a schema, raw `JSON.parse` is used and primitive equality
 * applies field-by-field on the top-level keys present in `expected`.
 */
export interface FieldAccuracyOptions<S extends z.ZodTypeAny | undefined = undefined> {
  readonly schema?: S;
  /**
   * If true, comparisons are recursive (deep). If false (default), comparisons are
   * top-level only — a nested-object value must be referentially `===` or structurally
   * deep-equal to score. We default to deep equality because extraction suites care
   * about nested shapes.
   */
  readonly deep?: boolean;
  /** Optional list of field paths to ignore (top-level keys only). */
  readonly ignore?: readonly string[];
  /** If true, strings are compared after trim()ing. */
  readonly trimStrings?: boolean;
  /** If true, string comparison is case-insensitive. */
  readonly caseInsensitive?: boolean;
  /** Pass threshold for the aggregate score. Defaults to 1 (must match all fields). */
  readonly passThreshold?: number;
}

type Expected = Record<string, unknown>;

export function fieldAccuracy<S extends z.ZodTypeAny | undefined = undefined>(
  opts: FieldAccuracyOptions<S> = {},
): Scorer<string, S extends z.ZodTypeAny ? z.infer<S> : Expected> {
  const {
    schema,
    ignore = [],
    trimStrings = false,
    caseInsensitive = false,
    passThreshold = 1,
  } = opts;
  const ignored = new Set(ignore);

  return {
    name: "fieldAccuracy",
    score(output: string, expected): Score {
      const candidate = extractJsonCandidate(output);
      if (candidate === null) {
        return {
          scorer: "fieldAccuracy",
          value: 0,
          passed: false,
          reason: "no JSON object/array found in output",
        };
      }

      let parsedRaw: unknown;
      try {
        parsedRaw = JSON.parse(candidate);
      } catch (err) {
        return {
          scorer: "fieldAccuracy",
          value: 0,
          passed: false,
          reason: `output was not valid JSON: ${(err as Error).message}`,
        };
      }

      let parsed: unknown = parsedRaw;
      if (schema) {
        const result = schema.safeParse(parsedRaw);
        if (!result.success) {
          return {
            scorer: "fieldAccuracy",
            value: 0,
            passed: false,
            reason: `schema parse failed: ${result.error.issues[0]?.message ?? "unknown"}`,
            detail: result.error.issues,
          };
        }
        parsed = result.data;
      }

      if (!isPlainObject(parsed) || !isPlainObject(expected)) {
        return {
          scorer: "fieldAccuracy",
          value: 0,
          passed: false,
          reason: "fieldAccuracy expects both output and expectation to be objects",
        };
      }

      const expectedObj = expected as Expected;
      const parsedObj = parsed;
      const fields = Object.keys(expectedObj).filter((k) => !ignored.has(k));
      if (fields.length === 0) {
        return { scorer: "fieldAccuracy", value: 1, passed: true };
      }

      const fieldResults = fields.map((key) => {
        const exp = expectedObj[key];
        const act = parsedObj[key];
        return { key, matched: deepEqual(act, exp, { trimStrings, caseInsensitive }) };
      });

      const correct = fieldResults.filter((r) => r.matched).length;
      const value = correct / fields.length;
      const passed = value >= passThreshold;
      const wrong = fieldResults.filter((r) => !r.matched).map((r) => r.key);

      return {
        scorer: "fieldAccuracy",
        value: round(value),
        passed,
        ...(passed
          ? {}
          : {
              reason: `${correct}/${fields.length} fields matched; missed: ${wrong.join(", ")}`,
            }),
        detail: { fields: fieldResults, correct, total: fields.length },
      };
    },
  };
}

function deepEqual(
  a: unknown,
  b: unknown,
  opts: { trimStrings: boolean; caseInsensitive: boolean },
): boolean {
  if (a === b) return true;
  if (typeof a === "string" && typeof b === "string") {
    let x = a;
    let y = b;
    if (opts.trimStrings) {
      x = x.trim();
      y = y.trim();
    }
    if (opts.caseInsensitive) {
      x = x.toLowerCase();
      y = y.toLowerCase();
    }
    return x === y;
  }
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i], opts)) return false;
    }
    return true;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if (!deepEqual(a[k], b[k], opts)) return false;
    }
    return true;
  }
  return false;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000;
}

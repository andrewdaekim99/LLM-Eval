import type { z } from "zod";
import type { Score, Scorer } from "../types.js";

/**
 * Pass iff `output` is valid JSON conforming to the provided zod schema.
 * The case's expectation is unused. Designed to be the structural half of an
 * extraction suite; pair with `fieldAccuracy` for value checks.
 *
 * Tolerates fenced code blocks (```json ... ```) and trailing prose.
 */
export function jsonSchema<S extends z.ZodTypeAny>(schema: S): Scorer<string, unknown> {
  return {
    name: "jsonSchema",
    score(output: string): Score {
      const candidate = extractJsonCandidate(output);
      if (candidate === null) {
        return {
          scorer: "jsonSchema",
          value: 0,
          passed: false,
          reason: "no JSON object/array found in output",
        };
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(candidate);
      } catch (err) {
        return {
          scorer: "jsonSchema",
          value: 0,
          passed: false,
          reason: `output was not valid JSON: ${(err as Error).message}`,
        };
      }

      const result = schema.safeParse(parsed);
      if (!result.success) {
        return {
          scorer: "jsonSchema",
          value: 0,
          passed: false,
          reason: result.error.issues
            .slice(0, 3)
            .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
            .join("; "),
          detail: result.error.issues,
        };
      }

      return { scorer: "jsonSchema", value: 1, passed: true };
    },
  };
}

/**
 * Find the most plausible JSON candidate in a string. Returns null if none.
 * Handles: bare JSON, ```json fenced blocks, ``` fenced blocks, and prose with
 * embedded JSON. Picks the first {…} or […] block that's balanced.
 */
export function extractJsonCandidate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const fenced = matchFenced(trimmed);
  if (fenced) return fenced;

  const balanced = matchFirstBalancedJson(trimmed);
  return balanced;
}

function matchFenced(s: string): string | null {
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  if (!fence?.[1]) return null;
  return fence[1].trim();
}

function matchFirstBalancedJson(s: string): string | null {
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch !== "{" && ch !== "[") continue;
    const end = findBalancedEnd(s, i);
    if (end !== -1) return s.slice(i, end + 1);
  }
  return null;
}

function findBalancedEnd(s: string, start: number): number {
  const open = s[start];
  if (open !== "{" && open !== "[") return -1;
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

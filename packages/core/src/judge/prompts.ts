// Judge prompt template. Kept as a reviewable file (not a string in the scorer) so the
// prompt is version-controlled, diffable, and explicitly part of the public surface — the
// judge is itself a fallible model (ADR-0007) and its prompt is load-bearing.

import type { Message } from "../types.js";

/**
 * System prompt for the LLM-as-judge. Built to:
 *  1. Establish the evaluator role (not a participant, not a helper).
 *  2. Force structured JSON output so parsing is deterministic.
 *  3. Discourage self-preference / sycophancy by framing the judge as strict.
 *  4. Discourage length bias by calling it out explicitly.
 */
export const JUDGE_SYSTEM_PROMPT = `You are an impartial, strict evaluator scoring a single
output against a written rubric. You are NOT a helper, assistant, or participant — you grade.

When scoring:
- Apply the rubric exactly as written. Do not invent extra criteria.
- Reward correctness and rubric-adherence; penalize hallucination, missing requirements,
  or off-rubric content.
- Ignore length: a one-line correct answer scores the same as a verbose correct answer.
- If a reference answer is provided, treat it as one acceptable answer, not the only one.
  Equivalent or better answers should not be penalized.
- Do not give credit for "trying" — credit is for meeting the rubric.

Reply with ONLY a JSON object matching exactly this shape, no prose, no markdown fences:
{
  "verdict": "pass" | "partial" | "fail",
  "score": number between 0 and 1 inclusive,
  "reason": one-or-two-sentence explanation grounded in the rubric
}

verdict guidance:
- "pass": meets the rubric fully. score >= 0.85.
- "partial": meets some criteria, misses others. score 0.4–0.84.
- "fail": does not meet the rubric, hallucinates, or refuses inappropriately. score < 0.4.`;

export interface BuildJudgeMessagesInput {
  readonly rubric: string;
  readonly actual: string;
  readonly expected?: unknown;
  readonly input?: unknown;
  /**
   * Optional cache-bust marker — when judgeSamples > 1 we vary this per call so each
   * sample has a distinct cache key. The marker is in a labeled comment block the
   * judge is instructed to ignore.
   */
  readonly sampleMarker?: string;
}

export function buildJudgeMessages(inp: BuildJudgeMessagesInput): readonly Message[] {
  const parts: string[] = ["## Rubric", inp.rubric.trim()];

  if (inp.input !== undefined) {
    parts.push("", "## Task input", renderForJudge(inp.input));
  }
  if (inp.expected !== undefined) {
    parts.push("", "## Reference (one acceptable answer)", renderForJudge(inp.expected));
  }

  parts.push("", "## Output to grade", inp.actual);

  if (inp.sampleMarker !== undefined) {
    parts.push(
      "",
      `<!-- judge-pass-marker: ${inp.sampleMarker} — ignore this comment, it is for cache bookkeeping only -->`,
    );
  }

  parts.push("", "Return ONLY the JSON object specified in the system prompt.");

  return [{ role: "user", content: parts.join("\n") }];
}

function renderForJudge(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

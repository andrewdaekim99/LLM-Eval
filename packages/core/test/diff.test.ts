import { describe, expect, it } from "vitest";
import { diffCases, meanScoreValue } from "../src/diff.js";
import type { StoredCase, StoredScore } from "../src/db.js";

function storedCase(caseId: string, passed: boolean, scoreValue = passed ? 1 : 0): StoredCase {
  return {
    caseId,
    input: null,
    expectation: null,
    passed,
    aggregateScores: [{ scorer: "fake", value: scoreValue, passed }] as readonly StoredScore[],
  };
}

describe("diffCases", () => {
  it("returns still-passing when both runs pass the same case", () => {
    const a = [storedCase("c1", true)];
    const b = [storedCase("c1", true)];
    expect(diffCases(a, b)[0]?.kind).toBe("still-passing");
  });

  it("flags regressions", () => {
    const a = [storedCase("c1", true)];
    const b = [storedCase("c1", false)];
    const d = diffCases(a, b);
    expect(d[0]?.kind).toBe("regressed");
    expect(d[0]?.aScores?.[0]?.value).toBe(1);
    expect(d[0]?.bScores?.[0]?.value).toBe(0);
  });

  it("flags fixes", () => {
    const a = [storedCase("c1", false)];
    const b = [storedCase("c1", true)];
    expect(diffCases(a, b)[0]?.kind).toBe("fixed");
  });

  it("flags still-failing when neither run passes", () => {
    const a = [storedCase("c1", false)];
    const b = [storedCase("c1", false)];
    expect(diffCases(a, b)[0]?.kind).toBe("still-failing");
  });

  it("flags new cases (in B, not A)", () => {
    const a = [storedCase("c1", true)];
    const b = [storedCase("c1", true), storedCase("c2", true)];
    const d = diffCases(a, b);
    expect(d.map((x) => x.kind)).toEqual(["still-passing", "new"]);
  });

  it("flags removed cases (in A, not B)", () => {
    const a = [storedCase("c1", true), storedCase("c2", false)];
    const b = [storedCase("c1", true)];
    const d = diffCases(a, b);
    expect(d.map((x) => x.kind)).toEqual(["still-passing", "removed"]);
  });

  it("returns results sorted alphabetically by case id for stable output", () => {
    const a = [storedCase("zebra", true), storedCase("alpha", true)];
    const b = [storedCase("alpha", true), storedCase("zebra", true)];
    const d = diffCases(a, b);
    expect(d.map((x) => x.caseId)).toEqual(["alpha", "zebra"]);
  });

  it("handles the case where both sides are empty", () => {
    expect(diffCases([], [])).toEqual([]);
  });

  it("handles a complete suite swap (all removed, all new)", () => {
    const a = [storedCase("x", true)];
    const b = [storedCase("y", true)];
    const d = diffCases(a, b);
    expect(d.map((x) => x.kind).sort()).toEqual(["new", "removed"]);
  });
});

describe("meanScoreValue", () => {
  it("returns null for undefined or empty arrays", () => {
    expect(meanScoreValue(undefined)).toBeNull();
    expect(meanScoreValue([])).toBeNull();
  });

  it("computes the mean across scorer values", () => {
    expect(
      meanScoreValue([
        { scorer: "a", value: 1, passed: true },
        { scorer: "b", value: 0.5, passed: false },
      ]),
    ).toBe(0.75);
  });
});

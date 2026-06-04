import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  contains,
  exactMatch,
  extractJsonCandidate,
  fieldAccuracy,
  jsonSchema,
  regex,
} from "../src/scorers/index.js";

describe("exactMatch", () => {
  const s = exactMatch();

  it("passes on identical strings", () => {
    const r = s.score("hello", "hello");
    expect(r.passed).toBe(true);
    expect(r.value).toBe(1);
  });

  it("fails on different strings and includes both in the reason", () => {
    const r = s.score("hi", "hello");
    expect(r.passed).toBe(false);
    expect(r.value).toBe(0);
    expect(r.reason).toContain("expected");
    expect(r.reason).toContain("got");
  });

  it("respects trim option", () => {
    const trimmed = exactMatch({ trim: true });
    expect(trimmed.score("  hello  ", "hello").passed).toBe(true);
    expect(exactMatch().score("  hello  ", "hello").passed).toBe(false);
  });

  it("respects caseInsensitive option", () => {
    const ci = exactMatch({ caseInsensitive: true });
    expect(ci.score("HELLO", "hello").passed).toBe(true);
    expect(exactMatch().score("HELLO", "hello").passed).toBe(false);
  });

  it("handles empty strings", () => {
    expect(exactMatch().score("", "").passed).toBe(true);
    expect(exactMatch().score("", "x").passed).toBe(false);
  });
});

describe("contains", () => {
  const s = contains();

  it("passes when needle is in output", () => {
    expect(s.score("the quick brown fox", "brown").passed).toBe(true);
  });

  it("fails when needle is absent", () => {
    const r = s.score("the quick brown fox", "purple");
    expect(r.passed).toBe(false);
    expect(r.reason).toContain("purple");
  });

  it("is case-sensitive by default", () => {
    expect(s.score("Hello World", "hello").passed).toBe(false);
  });

  it("respects caseInsensitive option", () => {
    expect(contains({ caseInsensitive: true }).score("Hello World", "hello").passed).toBe(true);
  });

  it("treats empty needle as always-found", () => {
    expect(s.score("anything", "").passed).toBe(true);
  });
});

describe("regex", () => {
  it("passes when the pattern matches", () => {
    const s = regex(/\d{3}-\d{4}/);
    expect(s.score("call 555-1234 now", null).passed).toBe(true);
  });

  it("fails when the pattern does not match", () => {
    const s = regex(/\d{3}-\d{4}/);
    const r = s.score("no phone here", null);
    expect(r.passed).toBe(false);
    expect(r.reason).toContain("did not match");
  });

  it("respects flags on the pattern", () => {
    const ci = regex(/HELLO/i);
    expect(ci.score("oh hello there", null).passed).toBe(true);
  });
});

describe("jsonSchema", () => {
  const Schema = z.object({ name: z.string(), age: z.number().int() });
  const s = jsonSchema(Schema);

  it("passes on a clean JSON object matching the schema", () => {
    expect(s.score('{"name":"Ada","age":36}', null).passed).toBe(true);
  });

  it("fails when output is not JSON", () => {
    const r = s.score("definitely not json", null);
    expect(r.passed).toBe(false);
    expect(r.reason).toContain("no JSON");
  });

  it("fails when JSON does not match the schema", () => {
    const r = s.score('{"name":"Ada","age":"old"}', null);
    expect(r.passed).toBe(false);
    expect(r.reason).toContain("age");
  });

  it("tolerates ```json fenced output", () => {
    const out = '```json\n{"name":"Ada","age":36}\n```';
    expect(s.score(out, null).passed).toBe(true);
  });

  it("tolerates prose surrounding the JSON object", () => {
    const out = 'Sure! Here you go: {"name":"Ada","age":36} (let me know if you need more)';
    expect(s.score(out, null).passed).toBe(true);
  });

  it("fails on empty output", () => {
    expect(s.score("", null).passed).toBe(false);
  });
});

describe("extractJsonCandidate", () => {
  it("returns null for empty input", () => {
    expect(extractJsonCandidate("")).toBeNull();
    expect(extractJsonCandidate("   ")).toBeNull();
  });

  it("extracts a bare object", () => {
    expect(extractJsonCandidate('{"a":1}')).toBe('{"a":1}');
  });

  it("extracts a bare array", () => {
    expect(extractJsonCandidate("[1,2,3]")).toBe("[1,2,3]");
  });

  it("strips ``` fences", () => {
    expect(extractJsonCandidate('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("strips ```json fences", () => {
    expect(extractJsonCandidate('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it("handles braces inside strings without prematurely closing", () => {
    expect(extractJsonCandidate('{"note":"} hi"}')).toBe('{"note":"} hi"}');
  });

  it("picks the first balanced object when there is surrounding prose", () => {
    expect(extractJsonCandidate('hello {"a":1} world {"b":2}')).toBe('{"a":1}');
  });
});

describe("fieldAccuracy", () => {
  const Address = z.object({
    name: z.string(),
    street: z.string(),
    city: z.string(),
    zip: z.string(),
  });

  it("scores 1.0 when every field matches", () => {
    const s = fieldAccuracy({ schema: Address });
    const expected = { name: "Jane", street: "1 Main", city: "Boston", zip: "02101" };
    const output = JSON.stringify(expected);
    const r = s.score(output, expected);
    expect(r.value).toBe(1);
    expect(r.passed).toBe(true);
  });

  it("gives partial credit when some fields are wrong", () => {
    const s = fieldAccuracy({ schema: Address });
    const expected = { name: "Jane", street: "1 Main", city: "Boston", zip: "02101" };
    const output = JSON.stringify({ ...expected, city: "Cambridge", zip: "02139" });
    const r = s.score(output, expected);
    expect(r.value).toBe(0.5);
    expect(r.passed).toBe(false);
    expect(r.reason).toContain("city");
    expect(r.reason).toContain("zip");
  });

  it("trims strings when trimStrings is set", () => {
    const s = fieldAccuracy({ trimStrings: true });
    const r = s.score('{"a":" hello "}', { a: "hello" });
    expect(r.value).toBe(1);
    expect(r.passed).toBe(true);
  });

  it("supports caseInsensitive comparison", () => {
    const s = fieldAccuracy({ caseInsensitive: true });
    const r = s.score('{"a":"HELLO"}', { a: "hello" });
    expect(r.passed).toBe(true);
  });

  it("does not pass when passThreshold is unmet", () => {
    const s = fieldAccuracy({ passThreshold: 1 });
    const r = s.score('{"a":1,"b":2}', { a: 1, b: 3 });
    expect(r.value).toBe(0.5);
    expect(r.passed).toBe(false);
  });

  it("passes at partial threshold when configured", () => {
    const s = fieldAccuracy({ passThreshold: 0.5 });
    const r = s.score('{"a":1,"b":2}', { a: 1, b: 3 });
    expect(r.passed).toBe(true);
  });

  it("fails when output is not JSON", () => {
    const s = fieldAccuracy();
    const r = s.score("nope", { a: 1 });
    expect(r.passed).toBe(false);
    expect(r.value).toBe(0);
  });

  it("ignores specified fields", () => {
    const s = fieldAccuracy({ ignore: ["meta"] });
    const r = s.score(JSON.stringify({ a: 1, meta: "anything" }), { a: 1, meta: "expected" });
    expect(r.value).toBe(1);
    expect(r.passed).toBe(true);
  });

  it("deep-equals nested objects and arrays", () => {
    const s = fieldAccuracy();
    const out = { items: [1, 2, { x: "y" }] };
    expect(s.score(JSON.stringify(out), out).value).toBe(1);
    expect(s.score(JSON.stringify(out), { items: [1, 2, { x: "z" }] }).value).toBe(0);
  });
});

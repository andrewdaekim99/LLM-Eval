import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CachedModelClient, cacheKey } from "../src/client.js";
import type { GenerateRequest, GenerateResponse, ModelTransport } from "../src/types.js";

function makeRequest(overrides: Partial<GenerateRequest["params"]> = {}): GenerateRequest {
  return {
    params: {
      model: "claude-haiku-4-5",
      maxTokens: 256,
      temperature: 0,
      ...overrides,
    },
    messages: [{ role: "user", content: "hello" }],
  };
}

function makeTransport(
  response: Omit<GenerateResponse, "cacheHit" | "latencyMs">,
): ModelTransport & { calls: number } {
  const obj: ModelTransport & { calls: number } = {
    calls: 0,
    call: vi.fn(() => {
      obj.calls += 1;
      return Promise.resolve(response);
    }),
  };
  return obj;
}

const fakeResponse = {
  content: "hi there",
  inputTokens: 5,
  outputTokens: 3,
  model: "claude-haiku-4-5",
  stopReason: "end_turn" as string | null,
};

describe("cacheKey", () => {
  it("is stable for identical requests", () => {
    const a = cacheKey(makeRequest());
    const b = cacheKey(makeRequest());
    expect(a).toBe(b);
  });

  it("differs when model changes", () => {
    const a = cacheKey(makeRequest({ model: "claude-haiku-4-5" }));
    const b = cacheKey(makeRequest({ model: "claude-sonnet-4-6" }));
    expect(a).not.toBe(b);
  });

  it("differs when maxTokens changes", () => {
    const a = cacheKey(makeRequest({ maxTokens: 100 }));
    const b = cacheKey(makeRequest({ maxTokens: 200 }));
    expect(a).not.toBe(b);
  });

  it("differs when temperature changes", () => {
    const a = cacheKey(makeRequest({ temperature: 0 }));
    const b = cacheKey(makeRequest({ temperature: 0.7 }));
    expect(a).not.toBe(b);
  });

  it("differs when messages change", () => {
    const base = makeRequest();
    const other: GenerateRequest = {
      ...base,
      messages: [{ role: "user", content: "different" }],
    };
    expect(cacheKey(base)).not.toBe(cacheKey(other));
  });

  it("differs when a system prompt is added", () => {
    const a = cacheKey(makeRequest());
    const b = cacheKey(makeRequest({ system: "you are helpful" }));
    expect(a).not.toBe(b);
  });
});

describe("CachedModelClient", () => {
  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), "yardstick-cache-"));
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  it("calls the transport on a miss and writes to cache", async () => {
    const transport = makeTransport(fakeResponse);
    const client = new CachedModelClient({ transport, cacheDir });

    const res = await client.generate(makeRequest());
    expect(transport.calls).toBe(1);
    expect(res.content).toBe("hi there");
    expect(res.cacheHit).toBe(false);
  });

  it("returns the cached value on a second identical request", async () => {
    const transport = makeTransport(fakeResponse);
    const client = new CachedModelClient({ transport, cacheDir });

    await client.generate(makeRequest());
    const second = await client.generate(makeRequest());

    expect(transport.calls).toBe(1);
    expect(second.cacheHit).toBe(true);
    expect(second.content).toBe("hi there");
  });

  it("does not collide across different models", async () => {
    const transport = makeTransport(fakeResponse);
    const client = new CachedModelClient({ transport, cacheDir });

    await client.generate(makeRequest({ model: "claude-haiku-4-5" }));
    await client.generate(makeRequest({ model: "claude-sonnet-4-6" }));
    expect(transport.calls).toBe(2);
  });

  it("bypassCache forces a fresh call but still writes the result", async () => {
    const transport = makeTransport(fakeResponse);
    const client = new CachedModelClient({ transport, cacheDir, bypassCache: true });

    await client.generate(makeRequest());
    await client.generate(makeRequest());
    expect(transport.calls).toBe(2);

    // A non-bypass client should now see the cached value.
    const normal = new CachedModelClient({ transport, cacheDir });
    const res = await normal.generate(makeRequest());
    expect(res.cacheHit).toBe(true);
  });

  it("ignores corrupted cache files and refetches", async () => {
    const transport = makeTransport(fakeResponse);
    const client = new CachedModelClient({ transport, cacheDir });

    // Prime the cache, then corrupt it.
    await client.generate(makeRequest());
    expect(transport.calls).toBe(1);

    const { writeFile } = await import("node:fs/promises");
    const key = cacheKey(makeRequest());
    const path = join(cacheDir, key.slice(0, 2), `${key}.json`);
    await writeFile(path, "not json", "utf8");

    const res = await client.generate(makeRequest());
    expect(transport.calls).toBe(2);
    expect(res.cacheHit).toBe(false);
  });

  it("reports cache hits as latencyMs=0", async () => {
    const transport = makeTransport(fakeResponse);
    const client = new CachedModelClient({ transport, cacheDir });

    await client.generate(makeRequest());
    const cached = await client.generate(makeRequest());
    expect(cached.latencyMs).toBe(0);
  });
});

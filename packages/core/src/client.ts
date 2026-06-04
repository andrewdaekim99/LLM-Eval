// Cached model client (ADR-0004). The cache key is (model, prompt, input, params).
// Cache lives on disk under CACHE_DIR. Transport is pluggable so tests inject a fake.
//
// This file is the ONLY place in `core` that imports `@anthropic-ai/sdk`.

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { childLogger } from "./logger.js";
import {
  type GenerateRequest,
  type GenerateResponse,
  type ModelClient,
  type ModelTransport,
  RetryableError,
} from "./types.js";

const CachedResponseSchema = z.object({
  content: z.string(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  model: z.string(),
  stopReason: z.string().nullable(),
});

type CachedResponse = z.infer<typeof CachedResponseSchema>;

export interface CachedClientOptions {
  readonly transport: ModelTransport;
  readonly cacheDir: string;
  /** When true, skip cache read but still write on success. Useful for a single fresh call. */
  readonly bypassCache?: boolean;
}

export class CachedModelClient implements ModelClient {
  private readonly log = childLogger({ component: "client" });

  constructor(private readonly opts: CachedClientOptions) {}

  async generate(req: GenerateRequest): Promise<GenerateResponse> {
    const key = cacheKey(req);
    const path = cachePathFor(this.opts.cacheDir, key);

    if (!this.opts.bypassCache) {
      const hit = await this.tryReadCache(path);
      if (hit) {
        this.log.debug({ key, model: req.params.model }, "cache hit");
        return { ...hit, cacheHit: true, latencyMs: 0 };
      }
    }

    const startedAt = performance.now();
    const fresh = await this.opts.transport.call(req);
    const latencyMs = Math.round(performance.now() - startedAt);

    await this.writeCache(path, {
      content: fresh.content,
      inputTokens: fresh.inputTokens,
      outputTokens: fresh.outputTokens,
      model: fresh.model,
      stopReason: fresh.stopReason,
    });

    return { ...fresh, cacheHit: false, latencyMs };
  }

  private async tryReadCache(path: string): Promise<CachedResponse | null> {
    try {
      const raw = await readFile(path, "utf8");
      const parsed = CachedResponseSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        this.log.warn({ path, issues: parsed.error.issues }, "cache file malformed; ignoring");
        return null;
      }
      return parsed.data;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        this.log.warn({ err, path }, "cache read failed; treating as miss");
      }
      return null;
    }
  }

  private async writeCache(path: string, value: CachedResponse): Promise<void> {
    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, JSON.stringify(value, null, 2), "utf8");
    } catch (err) {
      this.log.warn({ err, path }, "cache write failed; continuing");
    }
  }
}

/** Deterministic cache key. Must be stable across runs for identical requests (ADR-0004). */
export function cacheKey(req: GenerateRequest): string {
  const canonical = JSON.stringify({
    model: req.params.model,
    maxTokens: req.params.maxTokens,
    temperature: req.params.temperature ?? null,
    topP: req.params.topP ?? null,
    stopSequences: req.params.stopSequences ?? null,
    system: req.params.system ?? null,
    messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function cachePathFor(cacheDir: string, key: string): string {
  // Shard by first 2 chars to avoid one massive directory.
  return join(cacheDir, key.slice(0, 2), `${key}.json`);
}

/** Concrete Anthropic transport. Maps RetryableError vs terminal errors at the boundary. */
export class AnthropicTransport implements ModelTransport {
  private readonly sdk: Anthropic;

  constructor(opts: { apiKey: string }) {
    this.sdk = new Anthropic({ apiKey: opts.apiKey });
  }

  async call(req: GenerateRequest): Promise<Omit<GenerateResponse, "cacheHit" | "latencyMs">> {
    try {
      const res = await this.sdk.messages.create({
        model: req.params.model,
        max_tokens: req.params.maxTokens,
        ...(req.params.temperature !== undefined && { temperature: req.params.temperature }),
        ...(req.params.topP !== undefined && { top_p: req.params.topP }),
        ...(req.params.stopSequences && { stop_sequences: [...req.params.stopSequences] }),
        ...(req.params.system !== undefined && { system: req.params.system }),
        messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
      });

      const content = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");

      return {
        content,
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
        model: res.model,
        stopReason: res.stop_reason,
      };
    } catch (err) {
      if (isRetryable(err)) {
        throw new RetryableError(err instanceof Error ? err.message : "retryable anthropic error");
      }
      throw err;
    }
  }
}

function isRetryable(err: unknown): boolean {
  if (err instanceof Anthropic.APIError) {
    if (err.status === 429) return true;
    if (err.status !== undefined && err.status >= 500) return true;
  }
  return false;
}

export const _testing = { cacheKey, cachePathFor };

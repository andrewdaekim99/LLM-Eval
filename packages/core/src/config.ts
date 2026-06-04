// Env loading + validation. Fails fast at startup (CLAUDE.md golden rule).
// Aliases like "*-latest" are rejected here (ADR-0005).

import { z } from "zod";
import { ConfigError } from "./types.js";

// Anthropic alias patterns we refuse to accept as pinned IDs.
const ALIAS_PATTERNS = [/-latest$/i, /^claude-3-5-sonnet$/i, /^claude-3-opus$/i];

const pinnedModelId = z
  .string()
  .min(1, "model id required")
  .refine(
    (id) => !ALIAS_PATTERNS.some((p) => p.test(id)),
    (id) => ({
      message: `"${id}" looks like a convenience alias. Use a pinned snapshot ID (see ADR-0005).`,
    }),
  );

const logLevel = z.enum(["trace", "debug", "info", "warn", "error"]).default("info");

const EnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY is required"),
  YARDSTICK_MODEL: pinnedModelId.default("claude-haiku-4-5"),
  YARDSTICK_JUDGE_MODEL: pinnedModelId.default("claude-sonnet-4-6"),
  DATABASE_URL: z.string().default("./.cache/yardstick.db"),
  CACHE_DIR: z.string().default("./.cache/responses"),
  LOG_LEVEL: logLevel,
});

export type YardstickConfig = z.infer<typeof EnvSchema>;

/**
 * Load and validate config from a record (defaults to `process.env`).
 * Throws a `ConfigError` with all violations joined — never a half-loaded config.
 */
export function loadConfig(
  source: Record<string, string | undefined> = process.env,
): YardstickConfig {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new ConfigError(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

/** Exposed for tests so the alias rejection list is checkable. */
export const _testing = { ALIAS_PATTERNS, EnvSchema };

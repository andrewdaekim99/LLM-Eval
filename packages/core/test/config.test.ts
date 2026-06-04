import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { ConfigError } from "../src/types.js";

const baseEnv = {
  ANTHROPIC_API_KEY: "sk-ant-test",
};

describe("loadConfig", () => {
  it("loads defaults when only the API key is provided", () => {
    const cfg = loadConfig(baseEnv);
    expect(cfg.ANTHROPIC_API_KEY).toBe("sk-ant-test");
    expect(cfg.YARDSTICK_MODEL).toBe("claude-haiku-4-5");
    expect(cfg.YARDSTICK_JUDGE_MODEL).toBe("claude-sonnet-4-6");
    expect(cfg.LOG_LEVEL).toBe("info");
  });

  it("fails fast when ANTHROPIC_API_KEY is missing", () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({})).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("rejects alias-style model IDs (ADR-0005)", () => {
    expect(() => loadConfig({ ...baseEnv, YARDSTICK_MODEL: "claude-haiku-latest" })).toThrow(
      /alias/i,
    );

    expect(() => loadConfig({ ...baseEnv, YARDSTICK_JUDGE_MODEL: "claude-3-5-sonnet" })).toThrow(
      /alias/i,
    );
  });

  it("accepts pinned snapshot IDs", () => {
    const cfg = loadConfig({
      ...baseEnv,
      YARDSTICK_MODEL: "claude-haiku-4-5",
      YARDSTICK_JUDGE_MODEL: "claude-opus-4-8",
    });
    expect(cfg.YARDSTICK_MODEL).toBe("claude-haiku-4-5");
    expect(cfg.YARDSTICK_JUDGE_MODEL).toBe("claude-opus-4-8");
  });

  it("rejects invalid log levels with a clear message", () => {
    expect(() => loadConfig({ ...baseEnv, LOG_LEVEL: "loud" })).toThrow(ConfigError);
  });

  it("reports all violations at once, not just the first", () => {
    let captured: ConfigError | undefined;
    try {
      loadConfig({ YARDSTICK_MODEL: "anything-latest", LOG_LEVEL: "loud" });
    } catch (err) {
      captured = err as ConfigError;
    }
    expect(captured).toBeInstanceOf(ConfigError);
    expect(captured?.message).toMatch(/ANTHROPIC_API_KEY/);
    expect(captured?.message).toMatch(/alias/i);
    expect(captured?.message).toMatch(/LOG_LEVEL/);
  });
});

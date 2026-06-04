// Structured logger. Library code never calls console.log (CLAUDE.md).
// Child loggers carry run / suite / case context so log lines are filterable.

import pino, { type Logger } from "pino";

export type { Logger };

let rootLogger: Logger | undefined;

export function getLogger(): Logger {
  rootLogger ??= pino({
    level: process.env.LOG_LEVEL ?? "info",
    base: { app: "yardstick" },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
  return rootLogger;
}

export function childLogger(fields: Record<string, unknown>): Logger {
  return getLogger().child(fields);
}

/** For tests: reset the cached root logger so a fresh level can be picked up. */
export function _resetLogger(): void {
  rootLogger = undefined;
}

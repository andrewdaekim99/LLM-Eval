import "server-only";

import { resolve } from "node:path";
import { HistoryDb, loadConfig } from "@yardstick/core";

// In Next.js dev mode, modules are re-evaluated on every hot reload — without
// a process-wide cache, each reload would open a fresh better-sqlite3 handle
// and leak file descriptors. Cache on globalThis so the same handle survives
// HMR within a single dev process.
const g = globalThis as unknown as { __ysDb?: HistoryDb };

export function getDb(): HistoryDb {
  if (!g.__ysDb) {
    const cfg = loadConfig();
    const path = resolve(process.cwd(), cfg.DATABASE_URL);
    g.__ysDb = new HistoryDb({ path });
  }
  return g.__ysDb;
}

import "server-only";

import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { HistoryDb, loadConfig } from "@yardstick/core";

// In Next.js dev mode, modules are re-evaluated on every hot reload — without
// a process-wide cache, each reload would open a fresh better-sqlite3 handle
// and leak file descriptors. Cache on globalThis so the same handle survives
// HMR within a single dev process.
const g = globalThis as unknown as { __ysDb?: HistoryDb };

export function getDb(): HistoryDb {
  if (!g.__ysDb) {
    const cfg = loadConfig();
    const path = resolveDbPath(cfg.DATABASE_URL);
    g.__ysDb = new HistoryDb({ path });
  }
  return g.__ysDb;
}

/**
 * The dashboard runs with `process.cwd()` set to apps/dashboard/, but the
 * canonical DB lives at the workspace root. When DATABASE_URL is relative we
 * resolve it against the directory containing pnpm-workspace.yaml so the
 * dashboard always points at the same DB as the CLI.
 */
function resolveDbPath(raw: string): string {
  if (isAbsolute(raw)) return raw;
  const root = findWorkspaceRoot(process.cwd()) ?? process.cwd();
  return resolve(root, raw);
}

function findWorkspaceRoot(start: string): string | null {
  let dir = start;
  while (true) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

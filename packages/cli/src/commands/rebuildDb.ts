import { readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { HistoryDb, loadConfig, readArtifact } from "@yardstick/core";

export interface RebuildDbOptions {
  readonly runs: string;
  readonly verbose: boolean;
}

export async function rebuildDbCommand(opts: RebuildDbOptions): Promise<void> {
  if (opts.verbose) process.env.LOG_LEVEL = "debug";

  const cfg = loadConfig();
  const runsDir = resolve(process.cwd(), opts.runs);
  const dbPath = resolve(process.cwd(), cfg.DATABASE_URL);

  let files: string[];
  try {
    files = (await readdir(runsDir)).filter((f) => f.endsWith(".json")).sort();
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      process.stderr.write(`no runs directory at ${runsDir}\n`);
      process.exit(2);
    }
    throw err;
  }

  if (files.length === 0) {
    process.stderr.write(`no artifacts found in ${runsDir}\n`);
    process.exit(0);
  }

  const db = new HistoryDb({ path: dbPath });
  let inserted = 0;
  let skipped = 0;
  let migrated = 0;
  try {
    for (const file of files) {
      const path = join(runsDir, file);
      try {
        const before = await readArtifact(path);
        // readArtifact migrates v1 → v2 transparently; detect by comparing schemaVersion to file.
        db.insertRun(before, path);
        inserted += 1;
        if (before.cases.some((c) => c.input === null && c.expectation === null)) {
          migrated += 1;
        }
      } catch (err) {
        process.stderr.write(`skipped ${file}: ${(err as Error).message}\n`);
        skipped += 1;
      }
    }
  } finally {
    db.close();
  }

  process.stdout.write(
    `rebuilt ${dbPath}: ${inserted} runs indexed (${migrated} migrated from v1), ${skipped} skipped\n`,
  );
}

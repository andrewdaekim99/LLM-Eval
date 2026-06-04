import { resolve } from "node:path";
import {
  AnthropicTransport,
  CachedModelClient,
  HistoryDb,
  loadConfig,
  persistArtifact,
  runSuite,
  type RunOptions,
} from "@yardstick/core";
import { loadSuiteFromFile } from "../loadSuite.js";
import { formatRunSummary } from "../format.js";

export interface RunCommandOptions {
  readonly cache: boolean;
  readonly output: string;
  readonly verbose: boolean;
  readonly samples?: number;
}

export async function runCommand(suitePath: string, opts: RunCommandOptions): Promise<void> {
  if (opts.verbose) process.env.LOG_LEVEL = "debug";

  const cfg = loadConfig();
  const suite = await loadSuiteFromFile(suitePath);

  const cacheDir = resolve(process.cwd(), cfg.CACHE_DIR);
  const transport = new AnthropicTransport({ apiKey: cfg.ANTHROPIC_API_KEY });
  const client = new CachedModelClient({
    transport,
    cacheDir,
    bypassCache: !opts.cache,
  });

  const runOpts: RunOptions = {
    client,
    ...(opts.samples !== undefined && { samplesOverride: opts.samples }),
  };

  const result = await runSuite(suite, runOpts);
  const outputDir = resolve(process.cwd(), opts.output);
  const { path, artifact } = await persistArtifact(result, outputDir);

  // Index into SQLite history (rebuildable any time via `yardstick rebuild-db`).
  const dbPath = resolve(process.cwd(), cfg.DATABASE_URL);
  const db = new HistoryDb({ path: dbPath });
  try {
    db.insertRun(artifact, path);
  } finally {
    db.close();
  }

  const colors = process.stdout.isTTY === true;
  process.stdout.write(`${formatRunSummary(result, path, colors)}\n`);

  process.exit(result.summary.passRate === 1 ? 0 : 1);
}

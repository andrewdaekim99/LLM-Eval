// Yardstick CLI entry point.

import { Command } from "commander";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { runCommand, type RunCommandOptions } from "./commands/run.js";
import { rebuildDbCommand, type RebuildDbOptions } from "./commands/rebuildDb.js";
import { historyCommand, type HistoryCommandOptions } from "./commands/history.js";
import { diffCommand } from "./commands/diff.js";
import { ciCommand, type CiCommandOptions } from "./commands/ci.js";

interface PackageJson {
  readonly version: string;
}

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as PackageJson;

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("yardstick")
    .description("Claude-native LLM evaluation & observability harness")
    .version(pkg.version, "-v, --version", "print the installed version");

  program
    .command("run")
    .description("run an eval suite against the configured model")
    .argument("<suite>", "path to a suite file (.ts or .js)")
    .option("--no-cache", "bypass the response cache (default: cache enabled)")
    .option("-o, --output <dir>", "directory for run artifacts", "runs")
    .option("-v, --verbose", "verbose logging", false)
    .option("-n, --samples <n>", "override samples-per-case (integer)", (v) => parseInt(v, 10))
    .action((suite: string, opts: RunCommandOptions) => {
      runCommand(suite, opts).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`yardstick run failed: ${msg}\n`);
        process.exit(2);
      });
    });

  program
    .command("rebuild-db")
    .description("rebuild the SQLite history from JSON artifacts on disk (idempotent)")
    .option("--runs <dir>", "directory containing run artifacts", "runs")
    .option("-v, --verbose", "verbose logging", false)
    .action((opts: RebuildDbOptions) => {
      rebuildDbCommand(opts).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`yardstick rebuild-db failed: ${msg}\n`);
        process.exit(2);
      });
    });

  program
    .command("history")
    .description("list past runs from the SQLite history")
    .option("-s, --suite <name>", "filter by suite")
    .option("-n, --limit <n>", "max rows", (v) => parseInt(v, 10), 20)
    .action((opts: HistoryCommandOptions) => {
      try {
        historyCommand(opts);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`yardstick history failed: ${msg}\n`);
        process.exit(2);
      }
    });

  program
    .command("diff")
    .description("diff two runs by run-id prefix (>=4 chars)")
    .argument("<runA>", "earlier run id prefix")
    .argument("<runB>", "later run id prefix")
    .action((runA: string, runB: string) => {
      try {
        diffCommand({ runA, runB });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`yardstick diff failed: ${msg}\n`);
        process.exit(2);
      }
    });

  program
    .command("ci")
    .description("run configured suites, apply the regression gate, exit non-zero on any failure")
    .option("--config <path>", "path to yardstick.config.json", "yardstick.config.json")
    .option("-o, --output <dir>", "directory for run artifacts", "runs")
    .option("--no-cache", "bypass the response cache")
    .option("-v, --verbose", "verbose logging", false)
    .action((opts: CiCommandOptions) => {
      ciCommand(opts).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        process.stderr.write(`yardstick ci failed: ${msg}\n`);
        process.exit(2);
      });
    });

  // Legacy stub: `report` is the umbrella users may type; route them to the new commands.
  program
    .command("report")
    .description("(removed) use `yardstick history` or `yardstick diff` instead")
    .action(() => {
      process.stderr.write(
        "`yardstick report` was split into `yardstick history` and `yardstick diff`.\n",
      );
      process.exit(2);
    });

  return program;
}

export function main(argv: readonly string[] = process.argv): void {
  buildProgram().parse([...argv]);
}

// Auto-invoke when this file is the entry point (direct `node src/index.ts` or via tsx).
// Does NOT fire when imported from elsewhere (e.g. the compiled bin script).
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(entry).href;
  } catch {
    return false;
  }
}

if (isEntryPoint()) main();

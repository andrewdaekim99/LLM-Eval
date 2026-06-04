// Yardstick CLI entry point.

import { Command } from "commander";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { runCommand, type RunCommandOptions } from "./commands/run.js";

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
    .command("report")
    .description("print a run summary / diff (Phase 2 — not yet implemented)")
    .action(() => {
      process.stderr.write("`yardstick report` ships in Phase 2.\n");
      process.exit(2);
    });

  program
    .command("ci")
    .description("run suites and apply the regression gate (Phase 3 — not yet implemented)")
    .action(() => {
      process.stderr.write("`yardstick ci` ships in Phase 3.\n");
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

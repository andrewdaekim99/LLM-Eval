// Yardstick CLI entry point.
// Phase 0: --version and --help only. Subcommands (run, report, ci) land in later phases.

import { Command } from "commander";
import { createRequire } from "node:module";

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
    .description("run an eval suite (Phase 1 — not yet implemented)")
    .argument("[suite]", "path to a suite file")
    .action((suite: string | undefined) => {
      process.stderr.write(
        `\`yardstick run\` ships in Phase 1.${suite ? ` (requested: ${suite})` : ""}\n`,
      );
      process.exit(2);
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

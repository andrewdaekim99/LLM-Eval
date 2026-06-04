import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { tsImport } from "tsx/esm/api";
import type { Suite } from "@yardstick/core";

/**
 * Load a Suite from a `.ts` or `.js` file. Looks for, in order:
 *   1. `export default <suite>`
 *   2. `export const suite = <suite>`
 *   3. The first exported value that looks like a Suite (has name, params, cases, scorers).
 */
export async function loadSuiteFromFile(filePath: string): Promise<Suite> {
  const absolute = resolve(process.cwd(), filePath);
  const parent = pathToFileURL(`${process.cwd()}/`).href;
  const mod = (await tsImport(absolute, parent)) as Record<string, unknown>;

  const candidates = [
    mod.default,
    mod.suite,
    ...Object.values(mod).filter((v) => v !== mod.default),
  ];

  for (const candidate of candidates) {
    if (isSuite(candidate)) return candidate;
  }

  throw new Error(
    `No exported Suite found in ${filePath}. Export a Suite as default, as \`suite\`, or as any named export.`,
  );
}

function isSuite(v: unknown): v is Suite {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.name === "string" &&
    typeof o.promptVersion === "string" &&
    typeof o.params === "object" &&
    o.params !== null &&
    Array.isArray(o.cases) &&
    Array.isArray(o.scorers) &&
    typeof o.buildPrompt === "function"
  );
}

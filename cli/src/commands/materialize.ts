import { readFile, writeFile } from "node:fs/promises";
import { compileProgram, materialize, parseDocument, validateAst } from "../../../src/index.js";
import type { SessionCompletion } from "../../../src/runtime/progression.js";

function readOutputPath(args: string[]): string | undefined {
  const outIndex = args.indexOf("--out");
  if (outIndex === -1) {
    return undefined;
  }

  return args[outIndex + 1];
}

function readResultsPath(args: string[]): string | undefined {
  const resultsIndex = args.indexOf("--results");
  if (resultsIndex === -1) {
    return undefined;
  }

  return args[resultsIndex + 1];
}

export async function runMaterializeCommand(args: string[]): Promise<number> {
  const [filePath] = args;

  if (!filePath) {
    console.error("Usage: psl materialize <file> [--results <results.json>] [--out <output-file>]");
    return 1;
  }

  const source = await readFile(filePath, "utf8");

  let ast: unknown;
  try {
    ast = parseDocument(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[error] $: Invalid YAML: ${message}`);
    return 1;
  }

  const validation = validateAst(ast);

  if (!validation.valid) {
    validation.diagnostics.forEach((diagnostic) => {
      console.error(`[${diagnostic.severity}] ${diagnostic.path}: ${diagnostic.message}`);
    });
    return 1;
  }

  if (!validation.value) {
    console.error("[error] $: Validation succeeded but no program value was produced.");
    return 1;
  }

  const compiled = compileProgram(validation.value);

  const resultsPath = readResultsPath(args);
  let completions: SessionCompletion[] | undefined;

  if (resultsPath) {
    let resultsJson: unknown;

    try {
      const resultsText = await readFile(resultsPath, "utf8");
      resultsJson = JSON.parse(resultsText) as unknown;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[error] $: Failed to read/parse results JSON: ${message}`);
      return 1;
    }

    if (Array.isArray(resultsJson)) {
      completions = resultsJson as SessionCompletion[];
    } else if (
      resultsJson &&
      typeof resultsJson === "object" &&
      !Array.isArray(resultsJson) &&
      Array.isArray((resultsJson as { sessions?: unknown }).sessions)
    ) {
      completions = (resultsJson as { sessions: unknown[] }).sessions as SessionCompletion[];
    } else {
      console.error("[error] $: Results JSON must be an array or an object { sessions: [...] }.");
      return 1;
    }
  }

  let sessions;
  try {
    sessions = materialize(compiled, completions ? { completions } : undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[error] $: Failed to materialize sessions: ${message}`);
    return 1;
  }

  const outputProgram = {
    ...compiled,
    sessions
  };

  const output = `${JSON.stringify(outputProgram, null, 2)}\n`;

  const outFile = readOutputPath(args);
  if (outFile) {
    await writeFile(outFile, output, "utf8");
    console.log(`Wrote materialized output to ${outFile}`);
    return 0;
  }

  process.stdout.write(output);
  return 0;
}

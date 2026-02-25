import { writeFile } from "node:fs/promises";
import { compileProgram, parseDocument, validateAst } from "../../../src/index.js";
import { hasFlag, readFlagValue, readSourceInput } from "../util/args.js";
import {
  createErrorDiagnostic,
  hasErrorDiagnostics,
  printHumanDiagnostics,
  toJsonDiagnostics,
  writeJsonOutput
} from "../util/machine.js";

export async function runCompileCommand(args: string[]): Promise<number> {
  const jsonMode = hasFlag(args, "--json");
  const outFile = readFlagValue(args, "--out");

  let source: string;
  let sourceName: string;
  let fromStdin = false;

  try {
    const input = await readSourceInput(args, {
      valueFlags: ["--out", "--filename"],
      defaultFilename: "stdin.psl.yaml"
    });
    source = input.source;
    sourceName = input.sourceName;
    fromStdin = input.fromStdin;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (jsonMode) {
      return writeJsonOutput({
        ok: false,
        diagnostics: [createErrorDiagnostic(message, "PSL_E_INTERNAL")]
      });
    }
    console.error("Usage: psl compile <file> [--out <output-file>] [--stdin] [--filename <name>] [--json]");
    console.error(`[error] $: ${message}`);
    return 1;
  }

  let ast: unknown;
  try {
    ast = parseDocument(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (jsonMode) {
      return writeJsonOutput({
        ok: false,
        diagnostics: [createErrorDiagnostic(`Invalid YAML: ${message}`, "PSL_E_PARSE_YAML")]
      });
    }
    const sourceNote = fromStdin ? ` (${sourceName})` : "";
    console.error(`[error] $: Invalid YAML${sourceNote}: ${message}`);
    return 1;
  }

  const validation = validateAst(ast);
  const diagnostics = toJsonDiagnostics(validation.diagnostics);

  if (hasErrorDiagnostics(diagnostics)) {
    if (jsonMode) {
      return writeJsonOutput({
        ok: false,
        diagnostics
      });
    }

    printHumanDiagnostics(validation.diagnostics);
    return 1;
  }

  if (!validation.value) {
    if (jsonMode) {
      return writeJsonOutput({
        ok: false,
        diagnostics: [
          createErrorDiagnostic(
            "Validation succeeded but no program value was produced.",
            "PSL_E_INTERNAL"
          )
        ]
      });
    }

    console.error("[error] $: Validation succeeded but no program value was produced.");
    return 1;
  }

  let compiled: ReturnType<typeof compileProgram>;
  try {
    compiled = compileProgram(validation.value);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (jsonMode) {
      return writeJsonOutput({
        ok: false,
        diagnostics: [createErrorDiagnostic(`Failed to compile program: ${message}`, "PSL_E_INTERNAL")]
      });
    }

    console.error(`[error] $: Failed to compile program: ${message}`);
    return 1;
  }

  const compiledPretty = `${JSON.stringify(compiled, null, 2)}\n`;

  if (outFile) {
    try {
      await writeFile(outFile, compiledPretty, "utf8");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (jsonMode) {
        return writeJsonOutput({
          ok: false,
          diagnostics: [createErrorDiagnostic(`Failed to write output file: ${message}`, "PSL_E_INTERNAL")]
        });
      }
      console.error(`[error] $: Failed to write output file: ${message}`);
      return 1;
    }
  }

  if (jsonMode) {
    return writeJsonOutput({
      ok: true,
      diagnostics,
      compiled
    });
  }

  if (outFile) {
    console.log(`Wrote compiled output to ${outFile}`);
    return 0;
  }

  process.stdout.write(compiledPretty);
  return 0;
}

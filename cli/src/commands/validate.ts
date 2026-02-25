import { parseDocument, validateAst } from "../../../src/index.js";
import { hasFlag, readSourceInput } from "../util/args.js";
import {
  createErrorDiagnostic,
  hasErrorDiagnostics,
  printHumanDiagnostics,
  toJsonDiagnostics,
  writeJsonOutput
} from "../util/machine.js";

export async function runValidateCommand(args: string[]): Promise<number> {
  const jsonMode = hasFlag(args, "--json");

  let source: string;
  let sourceName: string;
  let fromStdin = false;

  try {
    const input = await readSourceInput(args, {
      valueFlags: ["--filename"],
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
        diagnostics: [createErrorDiagnostic(message, "PSL_E_INPUT_IO")]
      });
    }
    console.error("Usage: psl validate <file> [--stdin] [--filename <name>] [--json]");
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
  const ok = !hasErrorDiagnostics(diagnostics);

  if (jsonMode) {
    return writeJsonOutput({
      ok,
      diagnostics
    });
  }

  if (ok) {
    console.log("Validation passed.");
    return 0;
  }

  printHumanDiagnostics(validation.diagnostics);

  return 1;
}

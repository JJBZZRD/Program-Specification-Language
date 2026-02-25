import { readFile, writeFile } from "node:fs/promises";
import { compileProgram, materialize, parseDocument, validateAst } from "../../../src/index.js";
import type { SessionCompletion } from "../../../src/runtime/progression.js";
import { hasFlag, readFlagValue, readSourceInput, readTextFromStdin } from "../util/args.js";
import {
  createErrorDiagnostic,
  hasErrorDiagnostics,
  printHumanDiagnostics,
  toJsonDiagnostics,
  writeJsonOutput
} from "../util/machine.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function applyCalendarOverrides(
  ast: unknown,
  overrides: { start_date?: string; end_date?: string }
): unknown {
  if (!isRecord(ast)) {
    return ast;
  }

  if (!overrides.start_date && !overrides.end_date) {
    return ast;
  }

  const next: Record<string, unknown> = { ...ast };
  const calendar = isRecord(next.calendar) ? { ...next.calendar } : {};

  if (overrides.start_date) {
    calendar.start_date = overrides.start_date;
  }

  if (overrides.end_date) {
    calendar.end_date = overrides.end_date;
  }

  next.calendar = calendar;
  return next;
}

function parseCompletions(resultsJson: unknown): SessionCompletion[] {
  if (Array.isArray(resultsJson)) {
    return resultsJson as SessionCompletion[];
  }

  if (isRecord(resultsJson) && Array.isArray(resultsJson.sessions)) {
    return resultsJson.sessions as SessionCompletion[];
  }

  throw new Error("Results JSON must be an array or an object { sessions: [...] }.");
}

function codeForMaterializeFailure(
  message: string,
  hasCompletions: boolean
):
  | "PSL_E_SCHEDULE_REQUIRES_CALENDAR"
  | "PSL_E_INVALID_INTENSITY_RANGE"
  | "PSL_E_RESULTS_MISMATCH"
  | "PSL_E_INTERNAL" {
  const lower = message.toLowerCase();

  if (lower.includes("calendar.start_date is required") || lower.includes("calendar.end_date is required")) {
    return "PSL_E_SCHEDULE_REQUIRES_CALENDAR";
  }

  if (lower.includes("invalid intensity")) {
    return "PSL_E_INVALID_INTENSITY_RANGE";
  }

  if (hasCompletions) {
    return "PSL_E_RESULTS_MISMATCH";
  }

  return "PSL_E_INTERNAL";
}

export async function runMaterializeCommand(args: string[]): Promise<number> {
  const jsonMode = hasFlag(args, "--json");
  const outFile = readFlagValue(args, "--out");
  const resultsPath = readFlagValue(args, "--results");
  const startDateOverride = readFlagValue(args, "--start-date");
  const endDateOverride = readFlagValue(args, "--end-date");

  const resultsFromStdin = hasFlag(args, "--results-stdin") || resultsPath === "-";
  if (resultsFromStdin && resultsPath && resultsPath !== "-") {
    const message = "Specify either --results <file> or --results-stdin, not both.";
    if (jsonMode) {
      return writeJsonOutput({
        ok: false,
        diagnostics: [createErrorDiagnostic(message, "PSL_E_CONFLICTING_FIELDS")]
      });
    }

    console.error(`[error] $: ${message}`);
    return 1;
  }

  let source: string;
  let sourceName: string;
  let fromStdin = false;

  try {
    const input = await readSourceInput(args, {
      valueFlags: [
        "--out",
        "--results",
        "--filename",
        "--start-date",
        "--end-date"
      ],
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

    console.error(
      "Usage: psl materialize <file> [--results <results.json> | --results-stdin] [--start-date YYYY-MM-DD] [--end-date YYYY-MM-DD] [--out <output-file>] [--stdin] [--filename <name>] [--json]"
    );
    console.error(`[error] $: ${message}`);
    return 1;
  }

  if (fromStdin && resultsFromStdin) {
    const message = "Source and results cannot both be read from stdin in the same invocation.";
    if (jsonMode) {
      return writeJsonOutput({
        ok: false,
        diagnostics: [createErrorDiagnostic(message, "PSL_E_CONFLICTING_FIELDS")]
      });
    }

    console.error(`[error] $: ${message}`);
    return 1;
  }

  let astRaw: unknown;
  try {
    astRaw = parseDocument(source);
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

  const ast = applyCalendarOverrides(astRaw, {
    start_date: startDateOverride,
    end_date: endDateOverride
  });

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

  let completions: SessionCompletion[] | undefined;
  if (resultsPath || resultsFromStdin) {
    let resultsText: string;

    try {
      if (resultsFromStdin) {
        resultsText = await readTextFromStdin();
      } else {
        resultsText = await readFile(resultsPath!, "utf8");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (jsonMode) {
        return writeJsonOutput({
          ok: false,
          diagnostics: [
            createErrorDiagnostic(`Failed to read results JSON: ${message}`, "PSL_E_RESULTS_MISMATCH")
          ]
        });
      }

      console.error(`[error] $: Failed to read results JSON: ${message}`);
      return 1;
    }

    let resultsJson: unknown;
    try {
      resultsJson = JSON.parse(resultsText) as unknown;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (jsonMode) {
        return writeJsonOutput({
          ok: false,
          diagnostics: [
            createErrorDiagnostic(`Failed to parse results JSON: ${message}`, "PSL_E_RESULTS_MISMATCH")
          ]
        });
      }

      console.error(`[error] $: Failed to parse results JSON: ${message}`);
      return 1;
    }

    try {
      completions = parseCompletions(resultsJson);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (jsonMode) {
        return writeJsonOutput({
          ok: false,
          diagnostics: [createErrorDiagnostic(message, "PSL_E_RESULTS_MISMATCH")]
        });
      }

      console.error(`[error] $: ${message}`);
      return 1;
    }
  }

  let sessions;
  try {
    sessions = materialize(compiled, completions ? { completions } : undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = codeForMaterializeFailure(message, completions !== undefined);

    if (jsonMode) {
      return writeJsonOutput({
        ok: false,
        diagnostics: [createErrorDiagnostic(`Failed to materialize sessions: ${message}`, code)]
      });
    }

    console.error(`[error] $: Failed to materialize sessions: ${message}`);
    return 1;
  }

  const outputProgram = {
    ...compiled,
    sessions
  };

  const outputPretty = `${JSON.stringify(outputProgram, null, 2)}\n`;

  if (outFile) {
    try {
      await writeFile(outFile, outputPretty, "utf8");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (jsonMode) {
        return writeJsonOutput({
          ok: false,
          diagnostics: [createErrorDiagnostic(`Failed to write output file: ${message}`, "PSL_E_OUTPUT_IO")]
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
      materialized: outputProgram
    });
  }

  if (outFile) {
    console.log(`Wrote materialized output to ${outFile}`);
    return 0;
  }

  process.stdout.write(outputPretty);
  return 0;
}

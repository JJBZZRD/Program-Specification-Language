import type { Diagnostic, DiagnosticSeverity } from "../../../src/validate/diagnostics.js";

export type StableDiagnosticCode =
  | "PSL_E_PARSE_YAML"
  | "PSL_E_PARSE_SHORTHAND"
  | "PSL_E_SCHEMA_VALIDATION"
  | "PSL_E_MISSING_FIELD"
  | "PSL_E_CONFLICTING_FIELDS"
  | "PSL_E_INVALID_VALUE_RANGE"
  | "PSL_E_INVALID_INTENSITY_RANGE"
  | "PSL_E_SCHEDULE_REQUIRES_CALENDAR"
  | "PSL_E_RESULTS_MISMATCH"
  | "PSL_E_INTERNAL";

export interface JsonDiagnosticRange {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
}

export interface JsonDiagnostic {
  severity: DiagnosticSeverity;
  message: string;
  path: string;
  range?: JsonDiagnosticRange;
  code?: StableDiagnosticCode | (string & {});
}

export interface JsonCommandOutput {
  ok: boolean;
  diagnostics: JsonDiagnostic[];
  compiled?: unknown;
  materialized?: unknown;
}

const INTENSITY_RANGE_MESSAGE_PATTERN =
  /(percent_1rm|rpe value|rir value|load value|load_range|plus_load|intensity)/i;
const INVALID_RANGE_MESSAGE_PATTERN =
  /(must be between|must be >|must be >=|must be <|must be <=|must be an integer >=|must be an integer <=|on or after|>= min|must be finite)/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readDiagnosticRange(value: unknown): JsonDiagnosticRange | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const startLine = value.startLine;
  const startCol = value.startCol;
  const endLine = value.endLine;
  const endCol = value.endCol;

  if (
    typeof startLine !== "number" ||
    typeof startCol !== "number" ||
    typeof endLine !== "number" ||
    typeof endCol !== "number"
  ) {
    return undefined;
  }

  if (
    !Number.isInteger(startLine) ||
    !Number.isInteger(startCol) ||
    !Number.isInteger(endLine) ||
    !Number.isInteger(endCol)
  ) {
    return undefined;
  }

  return { startLine, startCol, endLine, endCol };
}

function inferValidationCode(path: string, message: string): StableDiagnosticCode {
  const lowerPath = path.toLowerCase();
  const lowerMessage = message.toLowerCase();

  if (
    lowerMessage.includes("calendar is required when using session schedules") ||
    lowerMessage.includes("calendar.end_date is required when using repeating session schedules")
  ) {
    return "PSL_E_SCHEDULE_REQUIRES_CALENDAR";
  }

  if (
    lowerMessage.includes("shorthand") ||
    lowerMessage.includes("unsupported intensity expression") ||
    lowerMessage.includes("unsupported reps expression")
  ) {
    return "PSL_E_PARSE_SHORTHAND";
  }

  if (lowerMessage.includes("specify either") && lowerMessage.includes("not both")) {
    return "PSL_E_CONFLICTING_FIELDS";
  }

  if (
    lowerMessage.includes(" is required") ||
    lowerMessage.startsWith("at least one ") ||
    lowerMessage.includes("must include exercises") ||
    lowerMessage.includes("requires at least one of") ||
    lowerMessage.includes("must specify either day or schedule")
  ) {
    return "PSL_E_MISSING_FIELD";
  }

  if (
    (lowerPath.includes(".intensity") || lowerMessage.includes("intensity")) &&
    INTENSITY_RANGE_MESSAGE_PATTERN.test(lowerMessage) &&
    INVALID_RANGE_MESSAGE_PATTERN.test(lowerMessage)
  ) {
    return "PSL_E_INVALID_INTENSITY_RANGE";
  }

  if (INVALID_RANGE_MESSAGE_PATTERN.test(lowerMessage)) {
    return "PSL_E_INVALID_VALUE_RANGE";
  }

  return "PSL_E_SCHEMA_VALIDATION";
}

export function toJsonDiagnostic(diagnostic: Diagnostic): JsonDiagnostic {
  const withExtras = diagnostic as Diagnostic & { code?: unknown; range?: unknown };
  const explicitCode = typeof withExtras.code === "string" ? withExtras.code : undefined;
  const range = readDiagnosticRange(withExtras.range);

  return {
    severity: diagnostic.severity,
    message: diagnostic.message,
    path: diagnostic.path || "$",
    ...(range ? { range } : {}),
    code: explicitCode ?? inferValidationCode(diagnostic.path || "$", diagnostic.message)
  };
}

export function toJsonDiagnostics(diagnostics: readonly Diagnostic[]): JsonDiagnostic[] {
  return diagnostics.map(toJsonDiagnostic);
}

export function createErrorDiagnostic(
  message: string,
  code: StableDiagnosticCode,
  path = "$"
): JsonDiagnostic {
  return {
    severity: "error",
    message,
    path,
    code
  };
}

export function hasErrorDiagnostics(diagnostics: readonly { severity: DiagnosticSeverity }[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

export function writeJsonOutput(output: JsonCommandOutput): number {
  process.stdout.write(`${JSON.stringify(output)}\n`);
  return output.ok ? 0 : 1;
}

export function printHumanDiagnostics(diagnostics: readonly Diagnostic[]): void {
  diagnostics.forEach((diagnostic) => {
    console.error(`[${diagnostic.severity}] ${diagnostic.path}: ${diagnostic.message}`);
  });
}


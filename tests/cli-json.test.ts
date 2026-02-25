import assert from "node:assert/strict";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { runCompileCommand } from "../cli/src/commands/compile.js";
import { runMaterializeCommand } from "../cli/src/commands/materialize.js";
import { runValidateCommand } from "../cli/src/commands/validate.js";

type CommandFn = (args: string[]) => Promise<number>;

type CapturedRun = {
  code: number;
  stdout: string;
  stderr: string;
};

const TEMP_DIR = path.join(".tmp", "cli-json");
const INVALID_YAML = 'language_version: "0.2"\nmetadata: [oops';
const EMOM_WARNING_PROGRAM = [
  'language_version: "0.2"',
  "metadata:",
  "  id: emom-warning",
  "  name: Emom Warning",
  "sessions:",
  "  - id: day-1",
  "    day: 1",
  "    exercises:",
  "      - exercise: Bench Press",
  "        sets:",
  "          - count: 1",
  "            work_type: time",
  "            time_mode: emom",
  "            duration_seconds: 600",
  "            reps: 3",
  ""
].join("\n");

async function ensureTempDir(): Promise<string> {
  await mkdir(TEMP_DIR, { recursive: true });
  return TEMP_DIR;
}

async function removeTempFile(filePath: string): Promise<void> {
  await rm(filePath, { force: true });
}

function toText(chunk: unknown): string {
  if (typeof chunk === "string") {
    return chunk;
  }
  if (Buffer.isBuffer(chunk)) {
    return chunk.toString("utf8");
  }
  return String(chunk);
}

async function runCommand(
  command: CommandFn,
  args: string[],
  options: { stdinText?: string; stdinIsTTY?: boolean } = {}
): Promise<CapturedRun> {
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  const stdinDescriptor = Object.getOwnPropertyDescriptor(process, "stdin");

  let stdout = "";
  let stderr = "";

  (process.stdout.write as unknown as (typeof process.stdout.write)) = ((chunk: unknown): boolean => {
    stdout += toText(chunk);
    return true;
  }) as typeof process.stdout.write;

  (process.stderr.write as unknown as (typeof process.stderr.write)) = ((chunk: unknown): boolean => {
    stderr += toText(chunk);
    return true;
  }) as typeof process.stderr.write;

  if (options.stdinText !== undefined || options.stdinIsTTY !== undefined) {
    const stdinText = options.stdinText ?? "";
    const stdin = Readable.from([stdinText]) as NodeJS.ReadStream & AsyncIterable<string | Buffer>;
    Object.defineProperty(stdin, "isTTY", { value: false, configurable: true });
    if (options.stdinIsTTY !== undefined) {
      Object.defineProperty(stdin, "isTTY", { value: options.stdinIsTTY, configurable: true });
    }
    Object.defineProperty(process, "stdin", { value: stdin, configurable: true });
  }

  try {
    const code = await command(args);
    return { code, stdout, stderr };
  } finally {
    (process.stdout.write as unknown as (typeof process.stdout.write)) = originalStdoutWrite;
    (process.stderr.write as unknown as (typeof process.stderr.write)) = originalStderrWrite;

    if (stdinDescriptor) {
      Object.defineProperty(process, "stdin", stdinDescriptor);
    }
  }
}

function parseJsonStdout(result: CapturedRun): any {
  assert.equal(result.stderr.trim(), "");
  assert.notEqual(result.stdout.trim(), "");
  return JSON.parse(result.stdout);
}

function assertDiagnosticShape(diagnostic: any): void {
  assert.ok(diagnostic);
  assert.ok(diagnostic.severity === "error" || diagnostic.severity === "warning");
  assert.equal(typeof diagnostic.message, "string");
  assert.equal(typeof diagnostic.path, "string");
  assert.equal(typeof diagnostic.code, "string");
}

export async function run(): Promise<void> {
  {
    const result = await runCommand(runValidateCommand, ["--json", "examples/hypertrophy_4day.psl.yaml"]);
    const payload = parseJsonStdout(result);

    assert.equal(result.code, 0);
    assert.equal(payload.ok, true);
    assert.ok(Array.isArray(payload.diagnostics));
    assert.equal("compiled" in payload, false);
    assert.equal("materialized" in payload, false);
  }

  {
    const source = await readFile("examples/hypertrophy_4day.psl.yaml", "utf8");
    const result = await runCommand(runValidateCommand, ["--json", "--filename", "program.psl.yaml"], {
      stdinText: source
    });
    const payload = parseJsonStdout(result);

    assert.equal(result.code, 0);
    assert.equal(payload.ok, true);
    assert.ok(Array.isArray(payload.diagnostics));
  }

  {
    const result = await runCommand(
      runValidateCommand,
      ["--json", "--stdin", "--filename", "program.psl.yaml"],
      { stdinText: EMOM_WARNING_PROGRAM }
    );
    const payload = parseJsonStdout(result);
    const warning = payload.diagnostics.find((diagnostic: any) => diagnostic.severity === "warning");

    assert.equal(result.code, 0);
    assert.equal(payload.ok, true);
    assert.ok(Array.isArray(payload.diagnostics));
    assert.ok(warning);
    assertDiagnosticShape(warning);
    assert.equal(warning.code, "PSL_E_SCHEMA_VALIDATION");
  }

  {
    const result = await runCommand(
      runValidateCommand,
      ["--json", "--stdin", "--filename", "invalid.psl.yaml"],
      { stdinText: INVALID_YAML }
    );
    const payload = parseJsonStdout(result);
    const diagnostic = payload.diagnostics[0];

    assert.equal(result.code, 1);
    assert.equal(payload.ok, false);
    assertDiagnosticShape(diagnostic);
    assert.equal(diagnostic.code, "PSL_E_PARSE_YAML");
    assert.equal(diagnostic.path, "$");
  }

  {
    const result = await runCommand(runValidateCommand, ["--json", "--stdin"], { stdinIsTTY: true });
    const payload = parseJsonStdout(result);
    const diagnostic = payload.diagnostics[0];

    assert.equal(result.code, 1);
    assert.equal(payload.ok, false);
    assertDiagnosticShape(diagnostic);
    assert.equal(diagnostic.code, "PSL_E_INTERNAL");
    assert.equal(diagnostic.path, "$");
  }

  {
    const result = await runCommand(runValidateCommand, ["--json", "testdata/invalid/bad_intensity.psl.yaml"]);
    const payload = parseJsonStdout(result);
    const diagnostic = payload.diagnostics[0];

    assert.equal(result.code, 1);
    assert.equal(payload.ok, false);
    assert.ok(Array.isArray(payload.diagnostics));
    assertDiagnosticShape(diagnostic);
    assert.equal(diagnostic.code, "PSL_E_INVALID_INTENSITY_RANGE");
  }

  {
    const result = await runCommand(runValidateCommand, ["--json", "testdata/invalid/missing_metadata.psl.yaml"]);
    const payload = parseJsonStdout(result);
    const diagnostic = payload.diagnostics[0];

    assert.equal(result.code, 1);
    assert.equal(payload.ok, false);
    assertDiagnosticShape(diagnostic);
    assert.equal(diagnostic.code, "PSL_E_MISSING_FIELD");
  }

  {
    const result = await runCommand(runValidateCommand, ["--json", "testdata/invalid/invalid_shorthand.psl.yaml"]);
    const payload = parseJsonStdout(result);
    const diagnostic = payload.diagnostics[0];

    assert.equal(result.code, 1);
    assert.equal(payload.ok, false);
    assertDiagnosticShape(diagnostic);
    assert.equal(diagnostic.code, "PSL_E_PARSE_SHORTHAND");
  }

  {
    const result = await runCommand(runValidateCommand, ["--json", "testdata/invalid/conflicting_rest.psl.yaml"]);
    const payload = parseJsonStdout(result);

    assert.equal(result.code, 1);
    assert.equal(payload.ok, false);
    assert.ok(Array.isArray(payload.diagnostics));
    payload.diagnostics.forEach((diagnostic: any) => {
      assertDiagnosticShape(diagnostic);
      assert.equal(diagnostic.code, "PSL_E_CONFLICTING_FIELDS");
    });
  }

  {
    const result = await runCommand(
      runValidateCommand,
      ["--json", "testdata/invalid/invalid_session_day.psl.yaml"]
    );
    const payload = parseJsonStdout(result);
    const diagnostic = payload.diagnostics[0];

    assert.equal(result.code, 1);
    assert.equal(payload.ok, false);
    assertDiagnosticShape(diagnostic);
    assert.equal(diagnostic.code, "PSL_E_INVALID_VALUE_RANGE");
  }

  {
    const result = await runCommand(
      runValidateCommand,
      ["--json", "testdata/invalid/schedule_missing_calendar.psl.yaml"]
    );
    const payload = parseJsonStdout(result);
    const diagnostic = payload.diagnostics[0];

    assert.equal(result.code, 1);
    assert.equal(payload.ok, false);
    assertDiagnosticShape(diagnostic);
    assert.equal(diagnostic.code, "PSL_E_SCHEDULE_REQUIRES_CALENDAR");
  }

  {
    const result = await runCommand(
      runValidateCommand,
      ["--json", "testdata/invalid/invalid_metadata_type.psl.yaml"]
    );
    const payload = parseJsonStdout(result);
    const diagnostic = payload.diagnostics[0];

    assert.equal(result.code, 1);
    assert.equal(payload.ok, false);
    assertDiagnosticShape(diagnostic);
    assert.equal(diagnostic.code, "PSL_E_SCHEMA_VALIDATION");
  }

  {
    const result = await runCommand(
      runValidateCommand,
      ["--json", "testdata/invalid/does_not_exist.psl.yaml"]
    );
    const payload = parseJsonStdout(result);
    const diagnostic = payload.diagnostics[0];

    assert.equal(result.code, 1);
    assert.equal(payload.ok, false);
    assertDiagnosticShape(diagnostic);
    assert.equal(diagnostic.code, "PSL_E_INTERNAL");
    assert.equal(diagnostic.path, "$");
  }

  {
    const result = await runCommand(runCompileCommand, ["--json", "examples/hypertrophy_4day.psl.yaml"]);
    const payload = parseJsonStdout(result);

    assert.equal(result.code, 0);
    assert.equal(payload.ok, true);
    assert.ok(Array.isArray(payload.diagnostics));
    assert.ok(payload.compiled);
    assert.equal(typeof payload.compiled, "object");
  }

  {
    const source = await readFile("examples/hypertrophy_4day.psl.yaml", "utf8");
    const result = await runCommand(
      runCompileCommand,
      ["--stdin", "--json", "--filename", "program.psl.yaml"],
      { stdinText: source }
    );
    const payload = parseJsonStdout(result);

    assert.equal(result.code, 0);
    assert.equal(payload.ok, true);
    assert.ok(payload.compiled);
  }

  {
    const result = await runCommand(
      runCompileCommand,
      ["--json", "--stdin", "--filename", "invalid.psl.yaml"],
      { stdinText: INVALID_YAML }
    );
    const payload = parseJsonStdout(result);
    const diagnostic = payload.diagnostics[0];

    assert.equal(result.code, 1);
    assert.equal(payload.ok, false);
    assertDiagnosticShape(diagnostic);
    assert.equal(diagnostic.code, "PSL_E_PARSE_YAML");
    assert.equal("compiled" in payload, false);
  }

  {
    const result = await runCommand(
      runCompileCommand,
      ["--json", "testdata/invalid/invalid_metadata_type.psl.yaml"]
    );
    const payload = parseJsonStdout(result);
    const diagnostic = payload.diagnostics[0];

    assert.equal(result.code, 1);
    assert.equal(payload.ok, false);
    assertDiagnosticShape(diagnostic);
    assert.equal(diagnostic.code, "PSL_E_SCHEMA_VALIDATION");
    assert.equal("compiled" in payload, false);
  }

  {
    const outPath = path.join(await ensureTempDir(), "compiled.json");
    const result = await runCommand(runCompileCommand, [
      "--json",
      "--out",
      outPath,
      "examples/hypertrophy_4day.psl.yaml"
    ]);
    const payload = parseJsonStdout(result);

    assert.equal(result.code, 0);
    assert.equal(payload.ok, true);
    assert.ok(payload.compiled);

    const outputText = await readFile(outPath, "utf8");
    const outputJson = JSON.parse(outputText);
    assert.deepEqual(outputJson, payload.compiled);
    await removeTempFile(outPath);
  }

  {
    const outPath = path.join(TEMP_DIR, "missing-dir", "compiled.json");
    const result = await runCommand(runCompileCommand, [
      "--json",
      "--out",
      outPath,
      "examples/hypertrophy_4day.psl.yaml"
    ]);
    const payload = parseJsonStdout(result);
    const diagnostic = payload.diagnostics[0];

    assert.equal(result.code, 1);
    assert.equal(payload.ok, false);
    assertDiagnosticShape(diagnostic);
    assert.equal(diagnostic.code, "PSL_E_INTERNAL");
    assert.equal("compiled" in payload, false);
  }

  {
    const source = await readFile("examples/progression_demo.psl.yaml", "utf8");
    const result = await runCommand(
      runMaterializeCommand,
      [
        "--stdin",
        "--json",
        "--filename",
        "program.psl.yaml",
        "--results",
        "examples/progression_demo.results.json"
      ],
      { stdinText: source }
    );
    const payload = parseJsonStdout(result);

    assert.equal(result.code, 0);
    assert.equal(payload.ok, true);
    assert.ok(payload.materialized);
    assert.ok(Array.isArray(payload.materialized.sessions));
  }

  {
    const result = await runCommand(
      runMaterializeCommand,
      ["--json", "--results-stdin", "examples/progression_demo.psl.yaml"],
      { stdinText: JSON.stringify({ sessions: [] }) }
    );
    const payload = parseJsonStdout(result);

    assert.equal(result.code, 0);
    assert.equal(payload.ok, true);
    assert.ok(payload.materialized);
    assert.ok(Array.isArray(payload.materialized.sessions));
  }

  {
    const result = await runCommand(
      runMaterializeCommand,
      ["--json", "--results", "-", "examples/progression_demo.psl.yaml"],
      { stdinText: "[]" }
    );
    const payload = parseJsonStdout(result);

    assert.equal(result.code, 0);
    assert.equal(payload.ok, true);
    assert.ok(payload.materialized);
    assert.ok(Array.isArray(payload.materialized.sessions));
  }

  {
    const outPath = path.join(await ensureTempDir(), "materialized.json");
    const result = await runCommand(runMaterializeCommand, [
      "--json",
      "--start-date",
      "2026-03-03",
      "--end-date",
      "2026-03-06",
      "--out",
      outPath,
      "examples/scheduling_demo.psl.yaml"
    ]);
    const payload = parseJsonStdout(result);

    assert.equal(result.code, 0);
    assert.equal(payload.ok, true);
    assert.ok(payload.materialized);
    assert.ok(Array.isArray(payload.materialized.sessions));
    assert.ok(payload.materialized.sessions.length > 0);
    assert.equal(payload.materialized.sessions[0].date_iso, "2026-03-03");
    assert.ok(
      payload.materialized.sessions.every(
        (session: any) => session.date_iso >= "2026-03-03" && session.date_iso <= "2026-03-06"
      )
    );

    const outputText = await readFile(outPath, "utf8");
    const outputJson = JSON.parse(outputText);
    assert.deepEqual(outputJson, payload.materialized);
    await removeTempFile(outPath);
  }

  {
    const result = await runCommand(
      runMaterializeCommand,
      ["--json", "--stdin", "--filename", "invalid.psl.yaml"],
      { stdinText: INVALID_YAML }
    );
    const payload = parseJsonStdout(result);
    const diagnostic = payload.diagnostics[0];

    assert.equal(result.code, 1);
    assert.equal(payload.ok, false);
    assertDiagnosticShape(diagnostic);
    assert.equal(diagnostic.code, "PSL_E_PARSE_YAML");
    assert.equal("materialized" in payload, false);
  }

  {
    const result = await runCommand(
      runMaterializeCommand,
      ["--json", "testdata/invalid/schedule_missing_calendar.psl.yaml"]
    );
    const payload = parseJsonStdout(result);
    const diagnostic = payload.diagnostics[0];

    assert.equal(result.code, 1);
    assert.equal(payload.ok, false);
    assertDiagnosticShape(diagnostic);
    assert.equal(diagnostic.code, "PSL_E_SCHEDULE_REQUIRES_CALENDAR");
    assert.equal("materialized" in payload, false);
  }

  {
    const result = await runCommand(runMaterializeCommand, [
      "--json",
      "--results",
      "examples/progression_demo.results.json",
      "--results-stdin"
    ]);
    const payload = parseJsonStdout(result);
    const diagnostic = payload.diagnostics[0];

    assert.equal(result.code, 1);
    assert.equal(payload.ok, false);
    assertDiagnosticShape(diagnostic);
    assert.equal(diagnostic.code, "PSL_E_CONFLICTING_FIELDS");
  }

  {
    const result = await runCommand(
      runMaterializeCommand,
      ["--json", "--stdin", "--results-stdin", "--filename", "program.psl.yaml"],
      { stdinText: EMOM_WARNING_PROGRAM }
    );
    const payload = parseJsonStdout(result);
    const diagnostic = payload.diagnostics[0];

    assert.equal(result.code, 1);
    assert.equal(payload.ok, false);
    assertDiagnosticShape(diagnostic);
    assert.equal(diagnostic.code, "PSL_E_CONFLICTING_FIELDS");
  }

  {
    const result = await runCommand(runMaterializeCommand, [
      "--json",
      "--results",
      "testdata/invalid/missing_results.json",
      "examples/progression_demo.psl.yaml"
    ]);
    const payload = parseJsonStdout(result);
    const diagnostic = payload.diagnostics[0];

    assert.equal(result.code, 1);
    assert.equal(payload.ok, false);
    assertDiagnosticShape(diagnostic);
    assert.equal(diagnostic.code, "PSL_E_RESULTS_MISMATCH");
  }

  {
    const result = await runCommand(runMaterializeCommand, [
      "--json",
      "--results",
      "testdata/invalid/results_malformed.json",
      "examples/progression_demo.psl.yaml"
    ]);
    const payload = parseJsonStdout(result);
    const diagnostic = payload.diagnostics[0];

    assert.equal(result.code, 1);
    assert.equal(payload.ok, false);
    assertDiagnosticShape(diagnostic);
    assert.equal(diagnostic.code, "PSL_E_RESULTS_MISMATCH");
  }

  {
    const result = await runCommand(runMaterializeCommand, [
      "--json",
      "--results",
      "testdata/invalid/results_invalid.json",
      "examples/progression_demo.psl.yaml"
    ]);
    const payload = parseJsonStdout(result);
    const diagnostic = payload.diagnostics[0];

    assert.equal(result.code, 1);
    assert.equal(payload.ok, false);
    assertDiagnosticShape(diagnostic);
    assert.equal(diagnostic.code, "PSL_E_RESULTS_MISMATCH");
  }
}

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
  options: { stdinText?: string } = {}
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

  if (options.stdinText !== undefined) {
    const stdin = Readable.from([options.stdinText]) as NodeJS.ReadStream & AsyncIterable<string | Buffer>;
    Object.defineProperty(stdin, "isTTY", { value: false, configurable: true });
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
    const result = await runCommand(runMaterializeCommand, [
      "--json",
      "--start-date",
      "2026-03-03",
      "--end-date",
      "2026-03-06",
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

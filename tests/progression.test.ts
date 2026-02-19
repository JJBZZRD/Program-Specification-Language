import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { SessionCompletion } from "../src/runtime/progression.js";
import { compileProgram } from "../src/compile/compileProgram.js";
import { materialize } from "../src/compile/materialize.js";
import { parseDocument } from "../src/parse/parseDocument.js";
import { validateAst } from "../src/validate/validateAst.js";

function toJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export async function run(): Promise<void> {
  const source = await readFile("examples/progression_demo.psl.yaml", "utf8");
  const ast = parseDocument(source);
  const validation = validateAst(ast);

  assert.equal(validation.valid, true);
  assert.ok(validation.value);

  const resultsText = await readFile("examples/progression_demo.results.json", "utf8");
  const completions = JSON.parse(resultsText) as SessionCompletion[];

  const compiled = compileProgram(validation.value);
  const sessions = materialize(compiled, { completions });

  const outputProgram = {
    ...compiled,
    sessions
  };

  const expectedText = await readFile("testdata/expected/progression_demo.materialized.json", "utf8");
  const expected = JSON.parse(expectedText) as unknown;

  assert.deepStrictEqual(toJson(outputProgram), expected);
}


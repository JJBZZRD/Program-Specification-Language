import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compileProgram } from "../src/compile/compileProgram.js";
import { parseDocument } from "../src/parse/parseDocument.js";
import { validateAst } from "../src/validate/validateAst.js";

function toJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function compileFixture(sourcePath: string) {
  const source = await readFile(sourcePath, "utf8");
  const ast = parseDocument(source);
  const validation = validateAst(ast);

  assert.equal(validation.valid, true);
  assert.ok(validation.value);

  return compileProgram(validation.value);
}

async function readExpected(expectedPath: string) {
  const expectedText = await readFile(expectedPath, "utf8");
  return JSON.parse(expectedText) as unknown;
}

export async function run(): Promise<void> {
  {
    const compiled = await compileFixture("examples/hypertrophy_4day.psl.yaml");
    const expected = await readExpected("testdata/expected/hypertrophy_4day.compiled.json");
    assert.deepStrictEqual(toJson(compiled), expected);
  }

  {
    const compiled = await compileFixture("examples/powerlifting_peak.psl.yaml");
    const expected = await readExpected("testdata/expected/powerlifting_peak.compiled.json");
    assert.deepStrictEqual(toJson(compiled), expected);
  }

  {
    const compiled = await compileFixture("examples/v0_2_language_growth.psl.yaml");

    assert.equal(compiled.language_version, "0.2");
    assert.equal(compiled.sessions.length, 3);
    assert.equal(compiled.sessions[0]?.slot, "AM");
    assert.equal(compiled.sessions[1]?.slot, "PM");

    const strengthSets = compiled.sessions[0]?.exercises[0]?.sets ?? [];
    assert.equal(strengthSets[0]?.role, "top");
    assert.equal(strengthSets[1]?.intensity?.type, "percent_of_set");

    const deloadSets = compiled.sessions[2]?.exercises[0]?.sets ?? [];
    assert.equal(deloadSets.length, 3);
    assert.equal(deloadSets[0]?.intensity?.type, "rpe");
    assert.equal(deloadSets[0]?.intensity?.value, 7);
    assert.equal(compiled.sessions[2]?.exercises[0]?.exercise, "squat_paused");
  }
}

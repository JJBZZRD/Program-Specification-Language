import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compileProgram } from "../src/compile/compileProgram.js";
import { materialize } from "../src/compile/materialize.js";
import { parseDocument } from "../src/parse/parseDocument.js";
import { validateAst } from "../src/validate/validateAst.js";

function toJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export async function run(): Promise<void> {
  const source = await readFile("examples/scheduling_demo.psl.yaml", "utf8");
  const ast = parseDocument(source);
  const validation = validateAst(ast);

  assert.equal(validation.valid, true);
  assert.ok(validation.value);

  const compiled = compileProgram(validation.value);
  const sessions = materialize(compiled);

  const outputProgram = {
    ...compiled,
    sessions
  };

  const expectedText = await readFile("testdata/expected/scheduling_demo.materialized.json", "utf8");
  const expected = JSON.parse(expectedText) as unknown;

  assert.deepStrictEqual(toJson(outputProgram), expected);

  {
    const validation2 = validateAst({
      language_version: "0.1",
      metadata: { id: "blocks-materialize", name: "Blocks Materialize" },
      calendar: { start_date: "2026-03-02" },
      blocks: [
        {
          id: "b1",
          duration: "7d",
          sessions: [
            {
              id: "bench",
              name: "Bench",
              schedule: "MON",
              exercises: [{ exercise: "Barbell Bench Press", sets: ["1x1 @RPE8"] }]
            }
          ]
        },
        {
          id: "b2",
          duration: "7d",
          sessions: [
            {
              id: "bench",
              name: "Bench",
              schedule: "MON",
              exercises: [{ exercise: "Barbell Bench Press", sets: ["1x1 @RPE8"] }]
            }
          ]
        }
      ]
    });

    assert.equal(validation2.valid, true);
    assert.ok(validation2.value);

    const compiled2 = compileProgram(validation2.value);
    const sessions2 = materialize(compiled2);

    const byId = new Map(sessions2.map((session) => [session.id, session]));

    assert.equal(byId.get("b1.bench")?.date_iso, "2026-03-02");
    assert.equal(byId.get("b2.bench")?.date_iso, "2026-03-09");
    assert.equal(sessions2.length, 2);
  }
}

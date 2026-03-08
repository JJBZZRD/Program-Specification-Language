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

  {
    const validation3 = validateAst({
      language_version: "0.2",
      metadata: { id: "slot-order", name: "Slot Order" },
      calendar: { start_date: "2026-03-02", end_date: "2026-03-02" },
      sessions: [
        {
          id: "pm",
          name: "PM",
          schedule: "MON",
          slot: "PM",
          exercises: [{ exercise: "Bench Press", sets: ["1x1 @RPE8"] }]
        },
        {
          id: "am",
          name: "AM",
          schedule: "MON",
          slot: "AM",
          exercises: [{ exercise: "Bench Press", sets: ["1x1 @RPE8"] }]
        }
      ]
    });

    assert.equal(validation3.valid, true);
    assert.ok(validation3.value);

    const compiled3 = compileProgram(validation3.value);
    const sessions3 = materialize(compiled3);

    assert.equal(sessions3.length, 2);
    assert.equal(sessions3[0]?.id, "am");
    assert.equal(sessions3[1]?.id, "pm");
    assert.equal(sessions3[0]?.slot, "AM");
    assert.equal(sessions3[1]?.slot, "PM");
  }

  {
    const validation4 = validateAst({
      language_version: "0.3",
      metadata: { id: "sequence-materialize", name: "Sequence Materialize" },
      calendar: {
        start_date: "2026-03-02",
        end_date: "2026-03-16"
      },
      sessions: [
        {
          id: "day1",
          name: "Day 1",
          exercises: [{ exercise: "Bench Press", sets: ["3x5 @75%"] }]
        },
        {
          id: "day2",
          name: "Day 2",
          exercises: [{ exercise: "Row", sets: ["3x5 @75%"] }]
        },
        {
          id: "day3",
          name: "Day 3",
          exercises: [{ exercise: "Deadlift", sets: ["3x5 @75%"] }]
        }
      ],
      sequence: {
        repeat: true,
        items: [
          { session_id: "day1", rest_after_days: 1 },
          { session_id: "day2", rest_after_days: 1 },
          { session_id: "day3", rest_after_days: 2 }
        ]
      }
    });

    assert.equal(validation4.valid, true);
    assert.ok(validation4.value);

    const compiled4 = compileProgram(validation4.value);
    const sessions4 = materialize(compiled4);

    assert.deepStrictEqual(
      sessions4.map((session) => ({
        id: session.id,
        date_iso: session.date_iso,
        occurrence: session.occurrence
      })),
      [
        { id: "day1", date_iso: "2026-03-02", occurrence: 1 },
        { id: "day2", date_iso: "2026-03-04", occurrence: 1 },
        { id: "day3", date_iso: "2026-03-06", occurrence: 1 },
        { id: "day1", date_iso: "2026-03-09", occurrence: 2 },
        { id: "day2", date_iso: "2026-03-11", occurrence: 2 },
        { id: "day3", date_iso: "2026-03-13", occurrence: 2 },
        { id: "day1", date_iso: "2026-03-16", occurrence: 3 }
      ]
    );
  }
}

import assert from "node:assert/strict";
import { compileProgram } from "../src/compile/compileProgram.js";

export function run(): void {
  const compiled = compileProgram({
    language_version: "0.1",
    metadata: {
      id: "snapshot",
      name: "Snapshot Program"
    },
    sessions: [
      {
        id: "day-1",
        name: "Day 1",
        day: 1,
        exercises: [
          {
            exercise: "Back Squat",
            sets: [
              {
                count: 2,
                reps: {
                  min: 3,
                  max: 5
                },
                intensity: {
                  type: "percent_1rm",
                  value: 80
                }
              }
            ]
          }
        ]
      }
    ]
  });

  assert.match(compiled.source_hash, /^[a-f0-9]{64}$/);

  const sets = compiled.sessions[0]?.exercises[0]?.sets;
  assert.ok(sets);
  assert.equal(sets.length, 2);

  assert.deepStrictEqual(sets[0], {
    index: 1,
    reps: {
      min: 3,
      max: 5
    },
    intensity: {
      type: "percent_1rm",
      value: 80
    },
    note: undefined
  });

  assert.deepStrictEqual(sets[1], {
    index: 2,
    reps: {
      min: 3,
      max: 5
    },
    intensity: {
      type: "percent_1rm",
      value: 80
    },
    note: undefined
  });
}

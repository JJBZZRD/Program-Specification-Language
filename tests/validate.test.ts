import assert from "node:assert/strict";
import { validateAst } from "../src/validate/validateAst.js";

export function run(): void {
  {
    const result = validateAst({
      language_version: "0.1",
      metadata: {
        id: "valid",
        name: "Valid"
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
                  count: 3,
                  reps: 5,
                  intensity: {
                    type: "percent_1rm",
                    value: 75
                  }
                }
              ]
            }
          ]
        }
      ]
    });

    assert.equal(result.valid, true);
    assert.deepStrictEqual(result.diagnostics, []);
    assert.ok(result.value);
  }

  {
    const result = validateAst({
      language_version: "0.1",
      metadata: {
        id: "invalid",
        name: "Invalid"
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
                  count: 3,
                  reps: 5,
                  intensity: {
                    type: "rpe",
                    value: 12
                  }
                }
              ]
            }
          ]
        }
      ]
    });

    assert.equal(result.valid, false);
    assert.equal(result.diagnostics[0]?.path, "$.sessions[0].exercises[0].sets[0].intensity.value");
  }

  {
    const result = validateAst({
      language_version: "0.1",
      metadata: {
        id: "shorthand",
        name: "Shorthand"
      },
      sessions: [
        {
          id: "day-1",
          name: "Day 1",
          day: 1,
          exercises: [
            {
              exercise: "Back Squat",
              sets: ["5x5 @75%"]
            }
          ]
        }
      ]
    });

    assert.equal(result.valid, true);
    assert.ok(result.value);

    assert.deepStrictEqual(result.value.sessions[0]?.exercises[0]?.sets[0], {
      count: 5,
      reps: 5,
      intensity: {
        type: "percent_1rm",
        value: 75
      }
    });
  }

  {
    const result = validateAst({
      language_version: "0.1",
      metadata: {
        id: "shorthand-invalid",
        name: "Shorthand Invalid"
      },
      sessions: [
        {
          id: "day-1",
          name: "Day 1",
          day: 1,
          exercises: [
            {
              exercise: "Back Squat",
              sets: ["3x5 @RPE12"]
            }
          ]
        }
      ]
    });

    assert.equal(result.valid, false);
    assert.equal(result.diagnostics[0]?.path, "$.sessions[0].exercises[0].sets[0].intensity.value");
  }
}

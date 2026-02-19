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

  {
    const result = validateAst({
      language_version: "0.1",
      metadata: {
        id: "load-shorthand",
        name: "Load Shorthand"
      },
      sessions: [
        {
          id: "day-1",
          name: "Day 1",
          day: 1,
          exercises: [
            {
              exercise: "Deadlift",
              sets: ["5x5 @150kg"]
            }
          ]
        }
      ]
    });

    assert.equal(result.valid, true);
    assert.ok(result.value);
    assert.deepStrictEqual(result.value.sessions[0]?.exercises[0]?.sets[0]?.intensity, {
      type: "load",
      value: 150,
      unit: "kg"
    });
  }

  {
    const result = validateAst({
      language_version: "0.1",
      metadata: {
        id: "load-object",
        name: "Load Object"
      },
      sessions: [
        {
          id: "day-1",
          name: "Day 1",
          day: 1,
          exercises: [
            {
              exercise: "Deadlift",
              sets: [
                {
                  count: 3,
                  reps: 3,
                  intensity: {
                    type: "load",
                    value: 180,
                    unit: "kg"
                  }
                }
              ]
            }
          ]
        }
      ]
    });

    assert.equal(result.valid, true);
    assert.ok(result.value);
  }

  {
    const result = validateAst({
      language_version: "0.1",
      metadata: {
        id: "load-bad-unit",
        name: "Load Bad Unit"
      },
      sessions: [
        {
          id: "day-1",
          name: "Day 1",
          day: 1,
          exercises: [
            {
              exercise: "Deadlift",
              sets: [
                {
                  count: 3,
                  reps: 3,
                  intensity: {
                    type: "load",
                    value: 180,
                    unit: "stone"
                  }
                }
              ]
            }
          ]
        }
      ]
    });

    assert.equal(result.valid, false);
    assert.equal(result.diagnostics[0]?.path, "$.sessions[0].exercises[0].sets[0].intensity.unit");
  }

  {
    const result = validateAst({
      language_version: "0.1",
      metadata: {
        id: "schedule-valid",
        name: "Schedule Valid"
      },
      calendar: {
        start_date: "2026-03-02",
        end_date: "2026-03-13"
      },
      sessions: [
        {
          id: "every-other-day",
          name: "Every Other Day",
          schedule: {
            type: "interval_days",
            every: 2
          },
          exercises: [
            {
              exercise: "Back Squat",
              sets: ["3x5 @75%"]
            }
          ]
        },
        {
          id: "mon-fri",
          name: "Mon/Fri",
          schedule: {
            type: "weekdays",
            days: ["MON", "FRI"]
          },
          exercises: [
            {
              exercise: "Barbell Bench Press",
              sets: ["5x5 @75%"]
            }
          ]
        }
      ]
    });

    assert.equal(result.valid, true);
    assert.ok(result.value);
  }

  {
    const result = validateAst({
      language_version: "0.1",
      metadata: {
        id: "schedule-missing-calendar",
        name: "Schedule Missing Calendar"
      },
      sessions: [
        {
          id: "every-other-day",
          name: "Every Other Day",
          schedule: {
            type: "interval_days",
            every: 2
          },
          exercises: [
            {
              exercise: "Back Squat",
              sets: ["3x5 @75%"]
            }
          ]
        }
      ]
    });

    assert.equal(result.valid, false);
    assert.equal(result.diagnostics[0]?.path, "$.calendar");
  }

  {
    const result = validateAst({
      language_version: "0.1",
      metadata: {
        id: "schedule-missing-end",
        name: "Schedule Missing End"
      },
      calendar: {
        start_date: "2026-03-02"
      },
      sessions: [
        {
          id: "every-other-day",
          name: "Every Other Day",
          schedule: {
            type: "interval_days",
            every: 2
          },
          exercises: [
            {
              exercise: "Back Squat",
              sets: ["3x5 @75%"]
            }
          ]
        }
      ]
    });

    assert.equal(result.valid, false);
    assert.equal(result.diagnostics[0]?.path, "$.calendar.end_date");
  }

  {
    const result = validateAst({
      language_version: "0.1",
      metadata: {
        id: "day-and-schedule",
        name: "Day And Schedule"
      },
      calendar: {
        start_date: "2026-03-02",
        end_date: "2026-03-13"
      },
      sessions: [
        {
          id: "bad",
          name: "Bad",
          day: 1,
          schedule: {
            type: "interval_days",
            every: 2
          },
          exercises: [
            {
              exercise: "Back Squat",
              sets: ["3x5 @75%"]
            }
          ]
        }
      ]
    });

    assert.equal(result.valid, false);
    assert.equal(result.diagnostics[0]?.path, "$.sessions[0].day");
  }

  {
    const result = validateAst({
      language_version: "0.1",
      metadata: {
        id: "neither-day-nor-schedule",
        name: "Neither Day Nor Schedule"
      },
      sessions: [
        {
          id: "bad",
          name: "Bad",
          exercises: [
            {
              exercise: "Back Squat",
              sets: ["3x5 @75%"]
            }
          ]
        }
      ]
    });

    assert.equal(result.valid, false);
    assert.equal(result.diagnostics[0]?.path, "$.sessions[0]");
  }
}

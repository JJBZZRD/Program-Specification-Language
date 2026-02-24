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
        id: "load-range-shorthand",
        name: "Load Range Shorthand"
      },
      sessions: [
        {
          id: "day-1",
          name: "Day 1",
          day: 1,
          exercises: [
            {
              exercise: "Deadlift",
              sets: ["5x5 @[100,120]kg"]
            }
          ]
        }
      ]
    });

    assert.equal(result.valid, true);
    assert.ok(result.value);
    assert.deepStrictEqual(result.value.sessions[0]?.exercises[0]?.sets[0]?.intensity, {
      type: "load_range",
      min: 100,
      max: 120,
      unit: "kg"
    });
  }

  {
    const result = validateAst({
      language_version: "0.1",
      metadata: {
        id: "intensity-string",
        name: "Intensity String"
      },
      sessions: [
        {
          id: "day-1",
          name: "Day 1",
          day: 1,
          exercises: [
            {
              exercise: "Bench Press",
              sets: [
                {
                  count: 3,
                  reps: 5,
                  intensity: "75%"
                }
              ]
            }
          ]
        }
      ]
    });

    assert.equal(result.valid, true);
    assert.ok(result.value);
    assert.deepStrictEqual(result.value.sessions[0]?.exercises[0]?.sets[0]?.intensity, {
      type: "percent_1rm",
      value: 75
    });
  }

  {
    const result = validateAst({
      language_version: "0.1",
      metadata: {
        id: "reps-string",
        name: "Reps String"
      },
      sessions: [
        {
          id: "day-1",
          name: "Day 1",
          day: 1,
          exercises: [
            {
              exercise: "Lat Pulldown",
              sets: [
                {
                  count: 4,
                  reps: "8-12",
                  intensity: "RIR2"
                }
              ]
            }
          ]
        }
      ]
    });

    assert.equal(result.valid, true);
    assert.ok(result.value);
    assert.deepStrictEqual(result.value.sessions[0]?.exercises[0]?.sets[0]?.reps, { min: 8, max: 12 });
    assert.deepStrictEqual(result.value.sessions[0]?.exercises[0]?.sets[0]?.intensity, {
      type: "rir",
      value: 2
    });
  }

  {
    const result = validateAst({
      language_version: "0.1",
      metadata: {
        id: "rest-duration",
        name: "Rest Duration"
      },
      sessions: [
        {
          id: "day-1",
          name: "Day 1",
          day: 1,
          exercises: [
            {
              exercise: "Row",
              rest: "2m",
              sets: ["3x10 @RPE7"]
            }
          ]
        }
      ]
    });

    assert.equal(result.valid, true);
    assert.ok(result.value);
    assert.equal(result.value.sessions[0]?.exercises[0]?.rest_seconds, 120);
  }

  {
    const result = validateAst({
      language_version: "0.1",
      metadata: {
        id: "schedule-string",
        name: "Schedule String"
      },
      calendar: {
        start_date: "2026-03-02",
        end_date: "2026-03-06"
      },
      sessions: [
        {
          id: "s1",
          name: "S1",
          schedule: "every other day +1",
          exercises: [
            {
              exercise: "Bench Press",
              sets: ["1x1 @RPE8"]
            }
          ]
        }
      ]
    });

    assert.equal(result.valid, true);
    assert.ok(result.value);
    assert.deepStrictEqual(result.value.sessions[0]?.schedule, {
      type: "interval_days",
      every: 2,
      start_offset_days: 1
    });
  }

  {
    const result = validateAst({
      language_version: "0.1",
      metadata: {
        id: "exercise-string",
        name: "Exercise String"
      },
      sessions: [
        {
          id: "day-1",
          name: "Day 1",
          day: 1,
          exercises: ['Bench Press: 5x5 @75%; rest 2m']
        }
      ]
    });

    assert.equal(result.valid, true);
    assert.ok(result.value);
    assert.equal(result.value.sessions[0]?.exercises[0]?.exercise, "Bench Press");
    assert.equal(result.value.sessions[0]?.exercises[0]?.rest_seconds, 120);
    assert.equal(result.value.sessions[0]?.exercises[0]?.sets.length, 1);
  }

  {
    const result = validateAst({
      language_version: "0.1",
      metadata: {
        id: "exercise-block",
        name: "Exercise Block"
      },
      sessions: [
        {
          id: "day-1",
          name: "Day 1",
          day: 1,
          exercises: `
Bench Press:
  5x5 @75% # volume
  rest 2m
Row: 3x10 @RIR2
`
        }
      ]
    });

    assert.equal(result.valid, true);
    assert.ok(result.value);
    assert.equal(result.value.sessions[0]?.exercises.length, 2);
    assert.equal(result.value.sessions[0]?.exercises[0]?.rest_seconds, 120);
    assert.equal(result.value.sessions[0]?.exercises[0]?.sets[0]?.note, "volume");
  }

  {
    const result = validateAst({
      language_version: "0.1",
      metadata: {
        id: "sets-block",
        name: "Sets Block"
      },
      sessions: [
        {
          id: "day-1",
          name: "Day 1",
          day: 1,
          exercises: [
            {
              exercise: "Deadlift",
              sets: `
1x5 @100kg
3x5 @[90,100]kg # backoffs
`
            }
          ]
        }
      ]
    });

    assert.equal(result.valid, true);
    assert.ok(result.value);
    assert.equal(result.value.sessions[0]?.exercises[0]?.sets.length, 2);
    assert.equal(result.value.sessions[0]?.exercises[0]?.sets[1]?.note, "backoffs");
  }

  {
    const result = validateAst({
      language_version: "0.1",
      metadata: {
        id: "progression-string",
        name: "Progression String"
      },
      calendar: {
        start_date: "2026-03-02"
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
                  count: 1,
                  reps: 5,
                  intensity: "100kg",
                  progression: "+2.5kg every 3 sessions on FRI if load>=target"
                }
              ]
            }
          ]
        }
      ]
    });

    assert.equal(result.valid, true);
    assert.ok(result.value);
    assert.deepStrictEqual(result.value.sessions[0]?.exercises[0]?.sets[0]?.progression, {
      type: "increment",
      when: {
        type: "metric_vs_target",
        metric: "load",
        op: ">=",
        target: "value"
      },
      by: 2.5,
      cadence: {
        type: "sessions",
        every: 3,
        on_weekdays: ["FRI"]
      }
    });
  }

  {
    const result = validateAst({
      language_version: "0.1",
      metadata: {
        id: "progression-percent-by-percent",
        name: "Progression Percent By Percent"
      },
      calendar: {
        start_date: "2026-03-02"
      },
      sessions: [
        {
          id: "day-1",
          name: "Day 1",
          day: 1,
          exercises: [
            {
              exercise: "Barbell Bench Press",
              sets: [
                {
                  count: 6,
                  reps: 6,
                  intensity: "70%",
                  progression: "+2.5% every week"
                }
              ]
            }
          ]
        }
      ]
    });

    assert.equal(result.valid, true);
    assert.ok(result.value);
    assert.deepStrictEqual(result.value.sessions[0]?.exercises[0]?.sets[0]?.progression, {
      type: "increment",
      when: undefined,
      by: 2.5,
      cadence: {
        type: "weeks",
        every: 1
      }
    });
  }

  {
    const result = validateAst({
      language_version: "0.1",
      metadata: {
        id: "progression-percent-by-load",
        name: "Progression Percent By Load"
      },
      calendar: {
        start_date: "2026-03-02"
      },
      sessions: [
        {
          id: "day-1",
          name: "Day 1",
          day: 1,
          exercises: [
            {
              exercise: "Barbell Bench Press",
              sets: [
                {
                  count: 6,
                  reps: 6,
                  intensity: "70%",
                  progression: "+5lb every week"
                }
              ]
            }
          ]
        }
      ]
    });

    assert.equal(result.valid, true);
    assert.ok(result.value);
    assert.deepStrictEqual(result.value.sessions[0]?.exercises[0]?.sets[0]?.progression, {
      type: "increment",
      when: undefined,
      by: {
        type: "load",
        value: 5,
        unit: "lb"
      },
      cadence: {
        type: "weeks",
        every: 1
      }
    });
  }

  {
    const result = validateAst({
      language_version: "0.1",
      metadata: {
        id: "load-range-object",
        name: "Load Range Object"
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
                    type: "load_range",
                    min: 180,
                    max: 200,
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
        id: "load-range-bad-order",
        name: "Load Range Bad Order"
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
                    type: "load_range",
                    min: 200,
                    max: 180,
                    unit: "kg"
                  }
                }
              ]
            }
          ]
        }
      ]
    });

    assert.equal(result.valid, false);
    assert.equal(result.diagnostics[0]?.path, "$.sessions[0].exercises[0].sets[0].intensity.max");
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
        id: "schedule-bounded-no-end",
        name: "Schedule Bounded No End"
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
            every: 2,
            end_offset_days: 6
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

    assert.equal(result.valid, true);
    assert.ok(result.value);
  }

  {
    const result = validateAst({
      language_version: "0.1",
      metadata: {
        id: "blocks-basic",
        name: "Blocks Basic"
      },
      calendar: {
        start_date: "2026-03-02"
      },
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
          duration: { type: "weeks", value: 1 },
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

    assert.equal(result.valid, true);
    assert.ok(result.value);
    assert.equal(result.value.calendar?.end_date, "2026-03-15");
    assert.equal(result.value.sessions.length, 2);
    assert.equal(result.value.sessions[0]?.id, "b1.bench");
    assert.equal(result.value.sessions[1]?.id, "b2.bench");
    assert.equal(result.value.sessions[0]?.schedule?.start_offset_days, 0);
    assert.equal(result.value.sessions[0]?.schedule?.end_offset_days, 6);
    assert.equal(result.value.sessions[1]?.schedule?.start_offset_days, 7);
    assert.equal(result.value.sessions[1]?.schedule?.end_offset_days, 13);
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

  {
    const result = validateAst({
      language_version: "0.1",
      metadata: {
        id: "progression-missing-calendar",
        name: "Progression Missing Calendar"
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
                  count: 1,
                  reps: 5,
                  intensity: { type: "load", value: 100, unit: "kg" },
                  progression: { type: "weekly_increment", by: 2.5 }
                }
              ]
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
        id: "progression-valid",
        name: "Progression Valid"
      },
      calendar: {
        start_date: "2026-03-02"
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
                  count: 1,
                  reps: 5,
                  intensity: { type: "load", value: 100, unit: "kg" },
                  progression: {
                    type: "weekly_increment",
                    when: { type: "metric_vs_target", metric: "load", op: ">=", target: "value" },
                    by: 2.5
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

    const set0 = result.value.sessions[0]?.exercises[0]?.sets[0];
    assert.deepStrictEqual(set0?.progression, {
      type: "weekly_increment",
      when: { type: "metric_vs_target", metric: "load", op: ">=", target: "value" },
      by: 2.5,
      cadence: undefined
    });
  }

  {
    const result = validateAst({
      language_version: "0.1",
      metadata: {
        id: "progression-missing-intensity",
        name: "Progression Missing Intensity"
      },
      calendar: {
        start_date: "2026-03-02"
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
                  count: 1,
                  reps: 5,
                  progression: { type: "weekly_increment", by: 2.5 }
                }
              ]
            }
          ]
        }
      ]
    });

    assert.equal(result.valid, false);
    assert.equal(result.diagnostics[0]?.path, "$.sessions[0].exercises[0].sets[0].progression");
  }

  {
    const result = validateAst({
      language_version: "0.1",
      metadata: {
        id: "progression-load-range-target-value",
        name: "Progression Load Range Target Value"
      },
      calendar: {
        start_date: "2026-03-02"
      },
      sessions: [
        {
          id: "day-1",
          name: "Day 1",
          day: 1,
          exercises: [
            {
              exercise: "Bench Press",
              sets: [
                {
                  count: 1,
                  reps: 5,
                  intensity: { type: "load_range", min: 80, max: 90, unit: "kg" },
                  progression: {
                    type: "weekly_increment",
                    when: { type: "metric_vs_target", metric: "load", op: ">=", target: "value" },
                    by: 2.5
                  }
                }
              ]
            }
          ]
        }
      ]
    });

    assert.equal(result.valid, false);
    assert.equal(result.diagnostics[0]?.path, "$.sessions[0].exercises[0].sets[0].progression.when.target");
  }

  {
    const result = validateAst({
      language_version: "0.1",
      metadata: {
        id: "progression-shorthand-wrapper",
        name: "Progression Shorthand Wrapper"
      },
      calendar: {
        start_date: "2026-03-02"
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
                  shorthand: "1x5 @100kg",
                  progression: { type: "weekly_increment", by: 2.5 }
                }
              ]
            }
          ]
        }
      ]
    });

    assert.equal(result.valid, true);
    assert.ok(result.value);
    assert.equal(result.value.sessions[0]?.exercises[0]?.sets[0]?.intensity?.type, "load");
    assert.equal(result.value.sessions[0]?.exercises[0]?.sets[0]?.progression?.type, "weekly_increment");
  }

  {
    const result = validateAst({
      language_version: "0.1",
      metadata: {
        id: "increment-missing-cadence",
        name: "Increment Missing Cadence"
      },
      calendar: {
        start_date: "2026-03-02"
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
                  count: 1,
                  reps: 5,
                  intensity: { type: "load", value: 100, unit: "kg" },
                  progression: { type: "increment", by: 2.5 }
                }
              ]
            }
          ]
        }
      ]
    });

    assert.equal(result.valid, false);
    assert.equal(result.diagnostics[0]?.path, "$.sessions[0].exercises[0].sets[0].progression.cadence");
  }

  {
    const result = validateAst({
      language_version: "0.1",
      metadata: {
        id: "increment-sessions-every-3",
        name: "Increment Sessions Every 3"
      },
      calendar: {
        start_date: "2026-03-02",
        end_date: "2026-03-14"
      },
      sessions: [
        {
          id: "bench",
          name: "Bench",
          schedule: {
            type: "interval_days",
            every: 4
          },
          exercises: [
            {
              exercise: "Barbell Bench Press",
              sets: [
                {
                  count: 1,
                  reps: 5,
                  intensity: { type: "load", value: 100, unit: "kg" },
                  progression: {
                    type: "increment",
                    cadence: { type: "sessions", every: 3 },
                    by: 2.5
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
    assert.equal(result.value.sessions[0]?.exercises[0]?.sets[0]?.progression?.type, "increment");
  }

  {
    const result = validateAst({
      language_version: "0.2",
      metadata: {
        id: "v0-2-valid",
        name: "v0.2 Valid"
      },
      units: "kg",
      exercise_aliases: {
        "comp squat": "squat_comp"
      },
      calendar: {
        start_date: "2026-03-02",
        end_date: "2026-03-16"
      },
      sessions: [
        {
          id: "strength-am",
          name: "Strength AM",
          schedule: "MON",
          slot: "AM",
          rest_default: "2m",
          exercises: [
            {
              exercise: "Competition Squat",
              exercise_id: "squat_comp",
              aliases: ["comp squat"],
              warmup: {
                type: "percent_ramp",
                from_percent: 40,
                to_percent: 85,
                steps: 4,
                reps: 3,
                based_on_role: "top"
              },
              sets: [
                "1x1 @RPE8 role top",
                "3x3 @-12% backoff cap@9",
                "EMOM 10m: 3 reps @70%"
              ]
            }
          ]
        }
      ]
    });

    assert.equal(result.valid, true);
    assert.ok(result.value);
    assert.equal(result.value.language_version, "0.2");
    assert.equal(result.value.sessions[0]?.slot, "AM");
    assert.equal(result.value.sessions[0]?.rest_default_seconds, 120);
    assert.equal(result.value.sessions[0]?.exercises[0]?.sets[1]?.intensity?.type, "percent_of_set");
    assert.equal(result.value.sessions[0]?.exercises[0]?.sets[1]?.constraints?.max_rpe, 9);
    assert.equal(result.value.sessions[0]?.exercises[0]?.sets[2]?.work_type, "time");
    assert.equal(result.value.sessions[0]?.exercises[0]?.exercise_id, "squat_comp");
  }

  {
    const result = validateAst({
      language_version: "0.2",
      metadata: {
        id: "v0-2-invalid-role-ref",
        name: "v0.2 Invalid Role Ref"
      },
      sessions: [
        {
          id: "s1",
          name: "S1",
          day: 1,
          exercises: [
            {
              exercise: "Bench Press",
              sets: ["3x3 @-10% backoff", "1x1 @RPE8 role top"]
            }
          ]
        }
      ]
    });

    assert.equal(result.valid, false);
    assert.equal(result.diagnostics[0]?.path, "$.sessions[0].exercises[0].sets[0].intensity.role");
  }

  {
    const result = validateAst({
      language_version: "0.2",
      metadata: {
        id: "v0-2-invalid-work-ambiguity",
        name: "v0.2 Invalid Work Ambiguity"
      },
      sessions: [
        {
          id: "s1",
          name: "S1",
          day: 1,
          exercises: [
            {
              exercise: "Bike",
              sets: [
                {
                  count: 3,
                  reps: 10,
                  work_type: "reps",
                  duration_seconds: 60
                }
              ]
            }
          ]
        }
      ]
    });

    assert.equal(result.valid, false);
    assert.equal(result.diagnostics[0]?.path, "$.sessions[0].exercises[0].sets[0].duration_seconds");
  }

  {
    const result = validateAst({
      language_version: "0.2",
      metadata: {
        id: "v0-2-wrapper-rest",
        name: "v0.2 Wrapper Rest"
      },
      sessions: [
        {
          id: "s1",
          name: "S1",
          day: 1,
          exercises: [
            {
              exercise: "Bench Press",
              sets: [
                {
                  shorthand: "1x5 @RPE8",
                  rest_seconds: "2m"
                }
              ]
            }
          ]
        }
      ]
    });

    assert.equal(result.valid, true);
    assert.ok(result.value);
    assert.equal(result.value.sessions[0]?.exercises[0]?.sets[0]?.rest_seconds, 120);
  }

  {
    const result = validateAst({
      language_version: "0.2",
      metadata: {
        id: "v0-2-inline-progression-exercise-shorthand",
        name: "v0.2 Inline Progression Exercise Shorthand"
      },
      calendar: {
        start_date: "2026-03-02"
      },
      sessions: [
        {
          id: "s1",
          name: "S1",
          day: 1,
          exercises: ["Romanian Deadlift: 3x8 @100kg; rest 2m; +2.5kg every 2 weeks if success"]
        }
      ]
    });

    assert.equal(result.valid, true);
    assert.ok(result.value);
    const exercise = result.value.sessions[0]?.exercises[0];
    assert.equal(exercise?.rest_seconds, 120);
    assert.deepStrictEqual(exercise?.sets[0]?.progression, {
      type: "increment",
      when: {
        type: "session_success",
        equals: true
      },
      by: 2.5,
      cadence: {
        type: "weeks",
        every: 2
      }
    });
  }

  {
    const result = validateAst({
      language_version: "0.2",
      metadata: {
        id: "v0-2-inline-progression-sets-block",
        name: "v0.2 Inline Progression Sets Block"
      },
      calendar: {
        start_date: "2026-03-02"
      },
      sessions: [
        {
          id: "s1",
          name: "S1",
          day: 1,
          exercises: [
            {
              exercise: "Bench Press",
              sets: `
1x4 @75% role top; +1.25kg every week if success
4x6 @-8% backoff
`
            }
          ]
        }
      ]
    });

    assert.equal(result.valid, true);
    assert.ok(result.value);
    assert.equal(result.value.sessions[0]?.exercises[0]?.sets[0]?.progression?.type, "increment");
    assert.equal(result.value.sessions[0]?.exercises[0]?.sets[1]?.intensity?.type, "percent_of_set");
  }
}

import assert from "node:assert/strict";
import { parseShorthand, ShorthandParseError } from "../src/parse/parseShorthand.js";

export function run(): void {
  assert.deepStrictEqual(parseShorthand("5x5 @75%"), {
    count: 5,
    reps: 5,
    intensity: {
      type: "percent_1rm",
      value: 75
    }
  });

  assert.deepStrictEqual(parseShorthand("5 x 5 @75%1RM"), {
    count: 5,
    reps: 5,
    intensity: {
      type: "percent_1rm",
      value: 75
    }
  });

  assert.deepStrictEqual(parseShorthand("6x6 @70% + 5lb"), {
    count: 6,
    reps: 6,
    intensity: {
      type: "percent_1rm",
      value: 70,
      plus_load: {
        value: 5,
        unit: "lb"
      }
    }
  });

  assert.deepStrictEqual(parseShorthand("6x6 @70%-2.5kg"), {
    count: 6,
    reps: 6,
    intensity: {
      type: "percent_1rm",
      value: 70,
      plus_load: {
        value: -2.5,
        unit: "kg"
      }
    }
  });

  assert.deepStrictEqual(parseShorthand("3x8-10 @RPE8"), {
    count: 3,
    reps: {
      min: 8,
      max: 10
    },
    intensity: {
      type: "rpe",
      value: 8
    }
  });

  assert.deepStrictEqual(parseShorthand("3x8 - 10 @8RPE"), {
    count: 3,
    reps: {
      min: 8,
      max: 10
    },
    intensity: {
      type: "rpe",
      value: 8
    }
  });

  assert.deepStrictEqual(parseShorthand("3x8 @2RIR"), {
    count: 3,
    reps: 8,
    intensity: {
      type: "rir",
      value: 2
    }
  });

  assert.deepStrictEqual(parseShorthand("5x5 @150kg"), {
    count: 5,
    reps: 5,
    intensity: {
      type: "load",
      value: 150,
      unit: "kg"
    }
  });

  assert.deepStrictEqual(parseShorthand("5x5 @150lbs"), {
    count: 5,
    reps: 5,
    intensity: {
      type: "load",
      value: 150,
      unit: "lb"
    }
  });

  assert.deepStrictEqual(parseShorthand("5x5 @[100,120]kg"), {
    count: 5,
    reps: 5,
    intensity: {
      type: "load_range",
      min: 100,
      max: 120,
      unit: "kg"
    }
  });

  assert.deepStrictEqual(parseShorthand("5x5 @100-120kg"), {
    count: 5,
    reps: 5,
    intensity: {
      type: "load_range",
      min: 100,
      max: 120,
      unit: "kg"
    }
  });

  assert.deepStrictEqual(parseShorthand("3x3 @-12%"), {
    count: 3,
    reps: 3,
    intensity: {
      type: "percent_of_set",
      role: "top",
      value: 88
    }
  });

  assert.deepStrictEqual(parseShorthand("3x3 @-10kg from top"), {
    count: 3,
    reps: 3,
    intensity: {
      type: "load_delta_from_set",
      role: "top",
      value: -10,
      unit: "kg"
    }
  });

  assert.deepStrictEqual(parseShorthand("AMRAP 8m @RPE8 cap12"), {
    count: 1,
    work_type: "time",
    time_mode: "amrap",
    duration_seconds: 480,
    role: "amrap",
    intensity: {
      type: "rpe",
      value: 8
    },
    constraints: {
      max_total_reps: 12
    }
  });

  assert.deepStrictEqual(parseShorthand("EMOM 10m: 3 reps @70%"), {
    count: 1,
    work_type: "time",
    time_mode: "emom",
    duration_seconds: 600,
    interval_seconds: 60,
    reps: 3,
    intensity: {
      type: "percent_1rm",
      value: 70
    }
  });

  assert.deepStrictEqual(parseShorthand("density 8m target 30 reps"), {
    count: 1,
    work_type: "time",
    time_mode: "density",
    duration_seconds: 480,
    target_total_reps: 30
  });

  assert.deepStrictEqual(parseShorthand("for time 8m target 30 reps @RPE8"), {
    count: 1,
    work_type: "time",
    time_mode: "for_time",
    duration_seconds: 480,
    target_total_reps: 30,
    intensity: {
      type: "rpe",
      value: 8
    }
  });

  assert.deepStrictEqual(parseShorthand("1x5 @RPE8 cap@9 up to 5 sets until RPE9"), {
    count: 1,
    reps: 5,
    intensity: {
      type: "rpe",
      value: 8
    },
    constraints: {
      max_rpe: 9
    },
    repeat: {
      max_sets: 5,
      until: {
        metric: "rpe",
        op: ">=",
        value: 9
      }
    }
  });

  assert.throws(() => parseShorthand("abc"), ShorthandParseError);
}

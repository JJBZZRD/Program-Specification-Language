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

  assert.throws(() => parseShorthand("abc"), ShorthandParseError);
}

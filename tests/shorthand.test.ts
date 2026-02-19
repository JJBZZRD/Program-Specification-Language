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

  assert.deepStrictEqual(parseShorthand("5x5 @150kg"), {
    count: 5,
    reps: 5,
    intensity: {
      type: "load",
      value: 150,
      unit: "kg"
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

  assert.throws(() => parseShorthand("abc"), ShorthandParseError);
}

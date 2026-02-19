import assert from "node:assert/strict";
import { parseDocument } from "../src/parse/parseDocument.js";

export function run(): void {
  const ast = parseDocument(`
language_version: "0.1"
metadata:
  id: demo
  name: Demo Program
sessions:
  - id: day-1
    name: Day 1
    day: 1
    exercises:
      - exercise: Back Squat
        sets:
          - count: 3
            reps: 5
`);

  const program = ast as any;
  assert.equal(program.language_version, "0.1");
  assert.equal(program.metadata?.id, "demo");
  assert.equal(program.metadata?.name, "Demo Program");
}

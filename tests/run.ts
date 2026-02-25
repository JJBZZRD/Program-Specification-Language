import { run as runCompileSnapshot } from "./compile.snapshot.test.js";
import { run as runCadence } from "./cadence.test.js";
import { run as runExamples } from "./examples.test.js";
import { run as runMaterialize } from "./materialize.test.js";
import { run as runParse } from "./parse.test.js";
import { run as runProgression } from "./progression.test.js";
import { run as runShorthand } from "./shorthand.test.js";
import { run as runValidate } from "./validate.test.js";
import { run as runExport } from "./export.test.js";
import { run as runCliJson } from "./cli-json.test.js";

type TestFn = () => void | Promise<void>;

const tests: Array<{ name: string; fn: TestFn }> = [
  { name: "parse", fn: runParse },
  { name: "shorthand", fn: runShorthand },
  { name: "validate", fn: runValidate },
  { name: "compile.snapshot", fn: runCompileSnapshot },
  { name: "examples", fn: runExamples },
  { name: "progression", fn: runProgression },
  { name: "cadence", fn: runCadence },
  { name: "materialize", fn: runMaterialize },
  { name: "export", fn: runExport },
  { name: "cli-json", fn: runCliJson }
];

let failed = 0;

for (const test of tests) {
  try {
    await test.fn();
    console.log(`ok - ${test.name}`);
  } catch (error) {
    failed += 1;
    console.error(`not ok - ${test.name}`);
    console.error(error);
  }
}

if (failed > 0) {
  process.exitCode = 1;
  console.error(`\n${failed} test(s) failed.`);
}

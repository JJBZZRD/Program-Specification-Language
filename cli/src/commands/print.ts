import { readFile } from "node:fs/promises";
import { compileProgram, parseDocument, validateAst } from "../../../src/index.js";

export async function runPrintCommand(args: string[]): Promise<number> {
  const [filePath] = args;

  if (!filePath) {
    console.error("Usage: psl print <file>");
    return 1;
  }

  const source = await readFile(filePath, "utf8");

  let ast: unknown;
  try {
    ast = parseDocument(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[error] $: Invalid YAML: ${message}`);
    return 1;
  }

  const validation = validateAst(ast);

  if (!validation.valid) {
    validation.diagnostics.forEach((diagnostic) => {
      console.error(`[${diagnostic.severity}] ${diagnostic.path}: ${diagnostic.message}`);
    });
    return 1;
  }

  if (!validation.value) {
    console.error("[error] $: Validation succeeded but no program value was produced.");
    return 1;
  }

  const compiled = compileProgram(validation.value);

  compiled.sessions.forEach((session) => {
    console.log(`Day ${session.day}: ${session.name}`);
    session.exercises.forEach((exercise) => {
      console.log(`  - ${exercise.exercise}`);
      exercise.sets.forEach((set) => {
        const repText =
          set.reps.min === set.reps.max ? `${set.reps.min}` : `${set.reps.min}-${set.reps.max}`;
        const intensityText = set.intensity
          ? ` @ ${set.intensity.type} ${set.intensity.value}`
          : "";
        console.log(`    set ${set.index}: ${repText}${intensityText}`);
      });
    });
  });

  return 0;
}
